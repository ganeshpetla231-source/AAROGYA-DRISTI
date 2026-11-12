import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EducationTopics from './EducationTopics.jsx';
import {
  archiveEducationArticle, createEducationDraft, getEducationArticles, getEducationDrafts,
  publishEducationArticle, reviewEducationDraft, submitEducationDraft, updateEducationDraft
} from '../services/api.js';
import './education.css';
import './education-help.css';
import './education-plaque-background.css';

const categories = ['awareness', 'ulcers', 'patches', 'infections', 'gum-disease', 'hygiene', 'tobacco', 'warning-signs', 'prevention', 'doctor-visit', 'screening', 'faqs'];
const languages = ['en', 'te', 'hi'];
const blankLocale = () => ({
  title: '', summary: '', what: '', causes: [''], signs: [''], precautions: [''],
  patientShould: [''], patientShouldNot: [''], whenToSeek: '', emergency: '',
  screeningFollowUp: '', faqs: [{ question: '', answer: '' }]
});
const blankContent = () => ({ en: blankLocale(), te: blankLocale(), hi: blankLocale() });

export function EducationLibrary({ role, language }) {
  const { t } = useTranslation();
  const canManage = ['admin', 'doctor', 'specialist'].includes(role);
  const canReview = ['doctor', 'specialist'].includes(role);
  const [articles, setArticles] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState(null);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState(null);
  const [contentJson, setContentJson] = useState('');
  const [sourcesJson, setSourcesJson] = useState('');
  const [imageAltJson, setImageAltJson] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadArticles() {
    setLoading(true);
    setError('');
    try {
      const params = { q: query.trim(), language, ...(category ? { category } : {}) };
      setArticles(manage && canManage ? await getEducationDrafts(params) : await getEducationArticles(params));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!manage) return undefined;
    const timer = window.setTimeout(loadArticles, 250);
    return () => window.clearTimeout(timer);
  }, [query, category, manage, canManage, language]);

  const selectedArticle = useMemo(() => articles.find(article => article._id === selected?._id) || selected, [articles, selected]);
  const localized = selectedArticle?.content?.[language] || selectedArticle?.content?.en;

  function startNewDraft() {
    setEditing({ slug: '', category: 'awareness', keywords: [], imageUrl: '', imageAttribution: '', imageAlt: { en: '', te: '', hi: '' }, content: blankContent(), medicalSources: [] });
    setContentJson(JSON.stringify(blankContent(), null, 2));
    setSourcesJson('[]');
    setImageAltJson(JSON.stringify({ en: '', te: '', hi: '' }, null, 2));
    setKeywordsText('');
    setSelected(null);
    setError('');
  }

  function startEditing(article) {
    setEditing(article);
    setContentJson(JSON.stringify(article.content, null, 2));
    setSourcesJson(JSON.stringify(article.medicalSources || [], null, 2));
    setImageAltJson(JSON.stringify(article.imageAlt || { en: '', te: '', hi: '' }, null, 2));
    setKeywordsText((article.keywords || []).join(', '));
    setSelected(null);
    setError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = {
        slug: editing.slug.trim(),
        category: editing.category,
        keywords: keywordsText.split(',').map(value => value.trim()).filter(Boolean),
        content: JSON.parse(contentJson),
        medicalSources: JSON.parse(sourcesJson),
        imageUrl: editing.imageUrl.trim(),
        imageAttribution: editing.imageAttribution.trim(),
        imageAlt: JSON.parse(imageAltJson || '{"en":"","te":"","hi":""}')
      };
      const saved = editing._id ? await updateEducationDraft(editing._id, data) : await createEducationDraft(data);
      setEditing(null);
      setNotice(t('education.draftSaved'));
      await loadArticles();
      setSelected(saved);
    } catch (failure) {
      setError(failure instanceof SyntaxError ? t('education.invalidJson') : failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action, successMessage) {
    if (!selectedArticle) return;
    setBusy(true);
    setError('');
    try {
      const updated = await action(selectedArticle._id);
      setNotice(t(successMessage));
      setSelected(updated);
      await loadArticles();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function review(decision) {
    setBusy(true);
    setError('');
    try {
      const reviewed = await reviewEducationDraft(selectedArticle._id, decision, reviewNotes);
      setSelected(reviewed);
      setNotice(t(decision === 'approved' ? 'education.reviewRecorded' : 'education.changesRequested'));
      setReviewNotes('');
      await loadArticles();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="education-library">
    <div className="education-safety" role="note">{t('education.safetyNotice')}</div>
    <section className="education-urgent panel">
      <div className="education-urgent-icon" aria-hidden="true">!</div>
      <div><h2>{t('education.seekHelpTitle')}</h2><p>{t('education.seekHelpText')}</p><strong>{t('education.emergencyText')}</strong></div>
    </section>
    <div className="education-toolbar panel">
      <label className="education-search"><span aria-hidden="true">⌕</span><span className="sr-only">{t('education.searchLabel')}</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('education.searchPlaceholder')} maxLength={120}/>
      </label>
      <label className="education-category"><span className="sr-only">{t('education.categoryFilter')}</span>
        <select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">{t('education.allCategories')}</option>
          {categories.map(item => <option key={item} value={item}>{t(`education.categories.${item}`)}</option>)}
        </select>
      </label>
      {canManage && <button className="education-manage-toggle" type="button" onClick={() => { setManage(!manage); setEditing(null); setSelected(null); }}>
        {t(manage ? 'education.publicLibrary' : 'education.manageContent')}
      </button>}
    </div>
    {error && <p className="education-error" role="alert">{error}</p>}
    {notice && <p className="education-notice" role="status">{notice}</p>}

    {!manage && <EducationTopics category={category} onSelect={setCategory} search={query}/>}

    {manage && editing && <form className="education-editor panel" onSubmit={saveDraft}>
      <div className="education-panel-heading"><div><p className="education-kicker">{t('education.contentManagement')}</p><h2>{editing._id ? t('education.editDraft') : t('education.newDraft')}</h2></div>
        <button type="button" className="education-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
      </div>
      <label>{t('education.slug')}<input required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={editing.slug} onChange={event => setEditing({ ...editing, slug: event.target.value })}/></label>
      <label>{t('education.category')}<select value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value })}>{categories.map(item => <option key={item} value={item}>{t(`education.categories.${item}`)}</option>)}</select></label>
      <label>{t('education.keywords')}<input value={keywordsText} onChange={event => setKeywordsText(event.target.value)} placeholder={t('education.keywordsHint')}/></label>
      <label>{t('education.contentJson')}<textarea required rows={16} value={contentJson} onChange={event => setContentJson(event.target.value)} spellCheck="false"/></label>
      <label>{t('education.sourcesJson')}<textarea required rows={5} value={sourcesJson} onChange={event => setSourcesJson(event.target.value)} spellCheck="false"/></label>
      <label>{t('education.imageUrl')}<input type="url" value={editing.imageUrl || ''} onChange={event => setEditing({ ...editing, imageUrl: event.target.value })} placeholder="https://"/></label>
      <label>{t('education.imageAttribution')}<input value={editing.imageAttribution || ''} onChange={event => setEditing({ ...editing, imageAttribution: event.target.value })}/></label>
      {editing.imageUrl && <label>{t('education.imageAltJson')}<textarea rows={3} value={imageAltJson} onChange={event => setImageAltJson(event.target.value)} spellCheck="false"/></label>}
      <p className="education-editor-help">{t('education.editorHelp')}</p>
      <button className="education-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
    </form>}

    {manage && selectedArticle && !editing ? <ArticleDetail
      article={selectedArticle}
      localized={localized}
      language={language}
      canManage={canManage && manage}
      canReview={canReview}
      relatedArticles={articles.filter(article => article._id !== selectedArticle._id && (article.category === selectedArticle.category || article.category === 'prevention')).slice(0, 3)}
      busy={busy}
      reviewNotes={reviewNotes}
      setReviewNotes={setReviewNotes}
      onBack={() => { setSelected(null); setError(''); }}
      onSelectArticle={setSelected}
      onEdit={() => startEditing(selectedArticle)}
      onSubmit={() => runAction(submitEducationDraft, 'submittedForReview')}
      onReview={review}
      onPublish={() => runAction(publishEducationArticle, 'articlePublished')}
      onArchive={() => runAction(archiveEducationArticle, 'articleArchived')}
    /> : manage && !editing && <>
      {manage && canManage && <div className="education-panel-heading education-management-heading">
        <div><p className="education-kicker">{t('education.contentManagement')}</p><h2>{t('education.draftsAndArticles')}</h2></div>
        <button className="education-primary" onClick={startNewDraft}>{t('education.newDraft')}</button>
      </div>}
      <div className="education-tip-grid">
        <article className="education-tip-card"><span aria-hidden="true">✦</span><div><h3>{t('education.tobaccoTipTitle')}</h3><p>{t('education.tobaccoTip')}</p></div></article>
        <article className="education-tip-card"><span aria-hidden="true">✚</span><div><h3>{t('education.hygieneTipTitle')}</h3><p>{t('education.hygieneTip')}</p></div></article>
        <article className="education-tip-card"><span aria-hidden="true">◷</span><div><h3>{t('education.followUpTipTitle')}</h3><p>{t('education.followUpTip')}</p></div></article>
      </div>
      {loading ? <div className="loading-state"><span className="spinner"/>{t('common.loading')}</div> : articles.length ? <div className="education-article-grid">
        {articles.map(article => <button className="education-article-card" key={article._id} onClick={() => setSelected(article)}>
          <span className="education-card-category">{t(`education.categories.${article.category}`)}</span>
          <h2>{article.content?.[language]?.title || article.content?.en?.title}</h2>
          <p>{article.content?.[language]?.summary || article.content?.en?.summary}</p>
          {manage && <span className={`education-review-badge status-${article.status}`}>{t(`education.status.${article.status}`)} · {t(`education.reviewStatus.${article.reviewStatus}`)}</span>}
          <span className="education-read-link">{t('education.readArticle')} ↗</span>
        </button>)}
      </div> : <div className="education-empty panel"><span aria-hidden="true">▤</span><h2>{t(manage ? 'education.noManagedArticles' : 'education.noPublishedArticles')}</h2><p>{t(manage ? 'education.noManagedArticlesHelp' : 'education.noPublishedArticlesHelp')}</p></div>}
      {!manage && <p className="education-review-reminder">{t('education.unreviewedReminder')}</p>}
      <section className="education-help panel" aria-labelledby="education-help-title">
        <h2 id="education-help-title">{t('education.helpTitle')}</h2>
        <div className="education-help-grid">
          <article>
            <h3>{t('education.publicationHelpTitle')}</h3>
            <p>{t('education.publicationHelpText')}</p>
            <p>{t('education.publicationHelpSteps')}</p>
          </article>
          <article>
            <h3>{t('education.voiceHelpTitle')}</h3>
            <p>{t('education.voiceHelpText')}</p>
            <p>{t('education.voiceHelpSteps')}</p>
          </article>
        </div>
        <p className="education-help-note">{t('education.helpSafetyNote')}</p>
      </section>
    </>}
  </section>;
}

function ArticleDetail({ article, localized, language, canManage, canReview, relatedArticles, busy, reviewNotes, setReviewNotes, onBack, onSelectArticle, onEdit, onSubmit, onReview, onPublish, onArchive }) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  if (!localized) return <p className="education-error" role="alert">{t('education.translationMissing')}</p>;
  const detailSections = [
    ['what', 'education.whatIsIt'], ['causes', 'education.causes'], ['signs', 'education.signs'],
    ['precautions', 'education.precautions'], ['patientShould', 'education.patientShould'],
    ['patientShouldNot', 'education.patientShouldNot'], ['whenToSeek', 'education.whenToSeek'],
    ['emergency', 'education.emergencySigns'], ['screeningFollowUp', 'education.screeningFollowUp']
  ];
  return <article className="education-detail panel">
    <button className="education-back" onClick={onBack}>← {t('education.backToLibrary')}</button>
    <div className="education-detail-heading"><div><span className="education-card-category">{t(`education.categories.${article.category}`)}</span><h2>{localized.title}</h2><p>{localized.summary}</p></div>
      <span className={`education-review-badge status-${article.status}`}>{t(`education.status.${article.status}`)} · {t(`education.reviewStatus.${article.reviewStatus}`)}</span>
    </div>
    {article.imageUrl && !imageFailed && <figure className="education-image"><img src={article.imageUrl} alt={article.imageAlt?.[language] || article.imageAlt?.en || localized.title} onError={() => setImageFailed(true)}/><figcaption>{localized.title}. {article.imageAttribution}</figcaption></figure>}
    {article.imageUrl && imageFailed && <div className="education-image-fallback" role="status">{t('education.imageUnavailable')}</div>}
    <div className="education-detail-grid">{detailSections.map(([field, label]) => {
      const value = localized[field];
      const hasPlaqueBackground = article.slug === 'daily-oral-hygiene' && field === 'causes';
      return <section
        className={`education-detail-section ${field === 'emergency' ? 'education-emergency' : ''}${hasPlaqueBackground ? ' education-detail-section-plaque-causes' : ''}`}
        key={field}
        aria-label={hasPlaqueBackground ? 'Illustration: sugary foods, poor brushing, dry mouth, and smoking can contribute to plaque buildup.' : undefined}
      >
        <h3>{t(label)}</h3>
        {Array.isArray(value) ? <ul>{value.map((item, index) => <li key={`${field}-${index}`}>{item}</li>)}</ul> : <p>{value}</p>}
      </section>;
    })}</div>
    {localized.faqs?.length > 0 && <section className="education-faq-section"><h3>{t('education.faqs')}</h3>{localized.faqs.map((faq, index) => <details key={index}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
    {article.medicalSources?.length > 0 && <section className="education-sources"><h3>{t('education.references')}</h3><ul>{article.medicalSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>)}</ul></section>}
    {relatedArticles.length > 0 && <section className="education-related"><h3>{t('education.relatedArticles')}</h3><div>{relatedArticles.map(related => <button key={related._id} onClick={() => onSelectArticle(related)}>{related.content?.[language]?.title || related.content?.en?.title} ↗</button>)}</div></section>}
    <div className="education-review-meta"><span>{article.reviewStatus === 'reviewed' ? `${t('education.reviewedBy')}: ${article.reviewerName || t('education.qualifiedReviewer')}` : t('education.notReviewed')}</span>{article.reviewedAt && <span>{t('education.reviewDate')}: {new Date(article.reviewedAt).toLocaleDateString(language)}</span>}</div>
    <div className="education-detail-actions">
      <button className="education-secondary print-hide" onClick={() => window.print()}>{t('education.printSummary')}</button>
      {canManage && article.status !== 'archived' && <button className="education-secondary print-hide" onClick={onEdit}>{t('education.editDraft')}</button>}
      {canManage && ['draft'].includes(article.status) && <button className="education-secondary print-hide" disabled={busy} onClick={onSubmit}>{t('education.submitForReview')}</button>}
      {canReview && article.status === 'pending-review' && article.reviewStatus !== 'reviewed' && <div className="education-review-controls print-hide">
        <label>{t('education.reviewerNotes')}<textarea value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} maxLength={2000}/></label>
        <button className="education-secondary" disabled={busy} onClick={() => onReview('changes-requested')}>{t('education.requestChanges')}</button>
        <button className="education-primary" disabled={busy} onClick={() => onReview('approved')}>{t('education.approveReview')}</button>
      </div>}
      {canReview && article.status === 'pending-review' && article.reviewStatus === 'reviewed' && <button className="education-primary print-hide" disabled={busy} onClick={onPublish}>{t('education.publishArticle')}</button>}
      {canManage && article.status !== 'archived' && <button className="education-danger print-hide" disabled={busy} onClick={onArchive}>{t('education.archiveArticle')}</button>}
    </div>
  </article>;
}
