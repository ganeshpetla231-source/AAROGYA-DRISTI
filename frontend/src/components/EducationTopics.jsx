import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { educationChapters } from '../data/educationChapters.js';
import './education-chapters.css';

const sections = [
  ['introduction', 'introduction'], ['detailedExplanation', 'detailedExplanation'], ['causes', 'causes'],
  ['signs', 'signs'], ['riskFactors', 'riskFactors'], ['typesStages', 'typesStages'],
  ['effects', 'effects'], ['prevention', 'precautions'], ['diagnosis', 'diagnosis'],
  ['treatment', 'treatment'], ['homeCare', 'homeCare'], ['whenToConsult', 'whenToSeek'], ['tips', 'tips']
];

const topicImages = {
  awareness: '/images/education/dental-examination.jpg',
  ulcers: '/images/oral-health-care-journey.png',
  patches: '/images/topics/oral-screening-review.svg',
  infections: '/images/dashboard/screening-activity.png',
  'gum-disease': '/images/plaque-buildup-causes.png',
  hygiene: '/images/oral-hygiene-brushing-guide.png',
  tobacco: '/images/oral-health-care-journey.png',
  'warning-signs': '/images/education/dental-examination.jpg',
  prevention: '/images/education/clear-aligner-care.jpg',
  'doctor-visit': '/images/education/dental-consultation.jpg',
  screening: '/images/education/dental-clinic.jpg',
  faqs: '/images/dashboard/action-history.png'
};

export default function EducationTopics({ category, onSelect, search = '' }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const selected = educationChapters.find(chapter => chapter.id === category);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleTopics = educationChapters.filter(chapter => !normalizedSearch ||
    `${t(`education.categories.${chapter.id}`)} ${chapter.introduction}`.toLocaleLowerCase().includes(normalizedSearch));
  const shownSections = expanded ? sections : sections.slice(0, 6);

  function navigateToSection(event, id) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
  }

  if (!selected) return <div className="education-topic-catalog" aria-live="polite">
    <p className="education-topic-intro">{t('education.chapter.catalogIntro')}</p>
    {visibleTopics.length ? <div className="education-article-grid">
      {visibleTopics.map(chapter => <article className="education-topic-card" key={chapter.id}>
        <TopicIllustration topic={chapter.id}/>
        <span className="education-card-category">{t(`education.categories.${chapter.id}`)}</span>
        <p>{chapter.introduction}</p>
        <button className="education-primary" type="button" onClick={() => onSelect(chapter.id)}>{t('education.chapter.open')}</button>
      </article>)}
    </div> : <div className="education-empty panel"><h2>{t('education.noPublishedArticles')}</h2><p>{t('education.noPublishedArticlesHelp')}</p></div>}
  </div>;

  return <article className="education-chapter panel">
    <button className="education-back" type="button" onClick={() => { onSelect(''); setExpanded(false); window.history.replaceState(null, '', window.location.pathname); }}>← {t('education.chapter.back')}</button>
    <header className="education-chapter-header">
      <div><span className="education-card-category">{t('education.chapter.kicker')}</span><h2>{t(`education.categories.${selected.id}`)}</h2><p>{selected.introduction}</p></div>
      <TopicIllustration topic={selected.id}/>
    </header>
    <nav className="education-chapter-toc" aria-label={t('education.chapter.contents')}>
      <strong>{t('education.chapter.contents')}</strong>
      <ol>{shownSections.map(([key, label]) => <li key={key}><a href={`#chapter-${key}`} onClick={event => navigateToSection(event, `chapter-${key}`)}>{t(`education.chapter.${label}`)}</a></li>)}
        <li><a href="#chapter-faqs" onClick={event => navigateToSection(event, 'chapter-faqs')}>{t('education.faqs')}</a></li>
      </ol>
    </nav>
    <div className="education-chapter-sections">
      {shownSections.map(([key, label]) => <section id={`chapter-${key}`} className="education-detail-section" key={key}>
        <h3>{t(`education.chapter.${label}`)}</h3>
        {Array.isArray(selected[key]) ? <ul>{selected[key].map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul> : <p>{selected[key]}</p>}
      </section>)}
    </div>
    <button className="education-secondary education-chapter-more" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
      {t(expanded ? 'education.chapter.showLess' : 'education.chapter.showMore')}
    </button>
    <section id="chapter-faqs" className="education-faq-section">
      <h3>{t('education.faqs')}</h3>
      {selected.faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
    </section>
    <section className="education-sources"><h3>{t('education.chapter.sources')}</h3><ul>{selected.sources.map(([title, url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{title}</a></li>)}</ul></section>
    <p className="education-chapter-disclaimer">{t('education.safetyNotice')}</p>
    <button className="education-back" type="button" onClick={() => { onSelect(''); window.history.replaceState(null, '', window.location.pathname); }}>← {t('education.chapter.back')}</button>
  </article>;
}

function TopicIllustration({ topic }) {
  const { t } = useTranslation();
  const image = topicImages[topic];
  if (!image) throw new Error(`Missing oral-health education image for topic "${topic}".`);
  const label = t(`education.categories.${topic}`);
  return <img
    className="education-topic-illustration"
    src={image}
    alt={`${label} — ${t('education.chapter.illustration')}`}
    loading="lazy"
    decoding="async"
  />;
}
