import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, RotateCcw, Send, Volume2 } from 'lucide-react';
import { getEducationVideoHistory, getEducationVideos, recordEducationVideoView, sendAssistantMessage } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import i18n from '../i18n/index.js';
import './education-videos.css';
import './education-video-assistant.css';
import './education-video-handoff.css';

const categoryIds = ['ulcers', 'oral-cancer-awareness', 'white-patches', 'red-patches', 'oral-hygiene', 'tongue-infections', 'oral-symptoms', 'precautions-prevention', 'when-to-visit-doctor'];




function duration(seconds, minuteLabel) { return `${Math.max(1, Math.round(seconds / 60))} ${minuteLabel}`; }

export function EducationVideoLibrary({ language = 'en' }) {
  const lang = ['en', 'te', 'hi'].includes(language) ? language : 'en';
  const text = i18n.getResource(lang, 'translation', 'educationVideoLibrary')?.[lang] || i18n.getResource('en', 'translation', 'educationVideoLibrary')?.en;
  const { user } = useAuth();
  const [videos, setVideos] = useState([]), [history, setHistory] = useState([]), [historyPagination, setHistoryPagination] = useState({ page: 1, pages: 1 }), [historyPage, setHistoryPage] = useState(1), [selected, setSelected] = useState(null);
  const [category, setCategory] = useState(''), [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [historyFailed, setHistoryFailed] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const items = await getEducationVideos({ language: lang, ...(query.trim() ? { q: query.trim() } : {}) }); setVideos(items); setSelected(current => current && items.some(item => item._id === current._id) ? current : null); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(load, 220); return () => window.clearTimeout(timer); }, [lang, category, query]);
  useEffect(() => { if (!user) { setHistory([]); setHistoryPagination({ page: 1, pages: 1 }); return; } getEducationVideoHistory({ page: historyPage, limit: 5 }).then(result => { setHistory(result.items || []); setHistoryPagination(result.pagination || { page: historyPage, pages: 1 }); }).catch(() => setHistoryFailed(true)); }, [user, historyPage]);
  const matchesTopic = (video, topic) => video.category === topic || video.relatedTopics?.includes(topic);
  const visibleCategories = useMemo(() => categoryIds.map((id, index) => ({ id, label: text.categories[index], count: videos.filter(video => matchesTopic(video, id)).length })), [videos, text]);
  const visibleVideos = useMemo(() => videos.filter(video => !category || matchesTopic(video, category)), [videos, category]);
  async function openVideo(video) {
    setSelected(video);
    if (!user) return;
    try { await recordEducationVideoView(video._id); const recent = await getEducationVideoHistory({ page: historyPage, limit: 5 }); setHistory(recent.items || []); setHistoryPagination(recent.pagination || { page: historyPage, pages: 1 }); setHistoryFailed(false); }
    catch { setHistoryFailed(true); }
  }
  const related = selected ? videos.filter(video => video._id !== selected._id && selected.relatedTopics?.some(topic => matchesTopic(video, topic))).slice(0, 4) : [];
  const selectTopic = topic => { setCategory(topic); setSelected(null); };

  return <section className="education-videos" aria-label={text.title}>
    <header className="video-library-intro"><span aria-hidden="true">▶</span><div><h2>{text.title}</h2><p>{text.subtitle}</p></div></header>
    <div className="video-library-tools"><label><span className="sr-only">{text.search}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text.search} maxLength={120}/></label>
      <label><span className="sr-only">{text.allCategories}</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">{text.allCategories}</option>{categoryIds.map((id, index) => <option key={id} value={id}>{text.categories[index]}</option>)}</select></label></div>
    <div className="video-category-grid">{visibleCategories.map((item, index) => <button key={item.id} type="button" className={`video-category-card ${category === item.id ? 'is-selected' : ''}`} onClick={() => setCategory(current => current === item.id ? '' : item.id)} aria-pressed={category === item.id}><span className="video-category-icon" aria-hidden="true">{['◌', '✚', '◉', '◉', '✦', '◉', '⌕', '✓', '＋'][index]}</span><span><b>{item.label}</b><small>{(item.count === 1 ? text.videoCountOne : text.videoCountOther).replace('{{count}}', item.count)}</small></span><span aria-hidden="true">↗</span></button>)}</div>
    {error && <div className="video-library-error" role="alert"><span>{error}</span><button type="button" onClick={load}>{text.retry}</button></div>}
    {loading ? <div className="loading-state"><span className="spinner"/>{text.loading}</div> : selected ? <>
      <section className="video-watch-layout" aria-label={selected.localizedTitle}>
        <div className="video-player-column"><div className="education-video-player"><iframe key={`${selected._id}-${lang}`} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.youtubeId)}?controls=1&playsinline=1&rel=0&cc_load_policy=1&cc_lang_pref=${lang}`} title={selected.localizedTitle} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen loading="lazy"/></div>
          <h2>{selected.localizedTitle || selected.title?.[lang] || selected.title?.en}</h2><p>{selected.localizedDescription || selected.description?.[lang] || selected.description?.en}</p><span className="education-video-duration">{duration(selected.durationSeconds, text.duration)}</span>
          <section className="video-simple-explanation"><h3>{text.explanation}</h3><p>{selected.localizedExplanation || selected.explanation?.[lang] || selected.explanation?.en}</p></section>
          {related.length > 0 && <section className="video-related"><h3>{text.related}</h3>{related.map(video => <button key={video._id} type="button" onClick={() => openVideo(video)}>{video.localizedTitle || video.title?.[lang] || video.title?.en} ↗</button>)}</section>}
        </div>
        <aside className="video-source-card"><h3>{text.source}</h3><b>{selected.sourceTitle}</b><p>{selected.attribution}</p><h3>{text.subtitles}</h3><p>{(selected.subtitleLanguages || []).map(code => i18n.t(`language.${code === 'te' ? 'telugu' : code === 'hi' ? 'hindi' : 'english'}`)).join(' · ') || text.captionsAvailable}</p><h3>{text.license}</h3><p>{selected.licenseNote}</p><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{text.open} ↗</a></aside>
        <VideoExplanationAssistant key={`${selected._id}-${lang}`} video={selected} language={lang} labels={i18n.getResource(lang, 'translation', 'videoExplanationAssistant')?.[lang]} handoffLabel={i18n.getResource(lang, 'translation', 'videoAssistantHandoff')?.[lang]} relatedTopics={text.categories} onSelectTopic={selectTopic}/>
      </section><button type="button" className="video-back-button" onClick={() => setSelected(null)}>{text.all}</button>
    </> : visibleVideos.length ? <div className="education-video-grid">{visibleVideos.map(video => <button type="button" className="education-video-card" key={video._id} onClick={() => openVideo(video)}><span className="education-video-thumb" aria-hidden="true">▶</span><span className="education-video-card-copy"><small>{text.categories[categoryIds.indexOf(video.category)]}</small><b>{video.localizedTitle || video.title?.[lang] || video.title?.en}</b><span>{duration(video.durationSeconds, text.duration)}</span></span></button>)}</div> : !error && <div className="video-empty"><span aria-hidden="true">▶</span><p>{text.empty}</p></div>}
    {user && !selected && history.length > 0 && <section className="video-history"><h3>{text.history}</h3><div>{history.map(item => <button key={item._id} type="button" onClick={() => openVideo(item.video)}>{item.video.title?.[lang] || item.video.title?.en}</button>)}</div>{historyPagination.pages > 1 && <nav aria-label={text.historyPages}><button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage(page => page - 1)}>{text.previous}</button><span>{historyPagination.page} / {historyPagination.pages}</span><button type="button" disabled={historyPage >= historyPagination.pages} onClick={() => setHistoryPage(page => page + 1)}>{text.next}</button></nav>}</section>}
    {historyFailed && <p className="video-history-note" role="status">{user ? error || text.retry : text.historyError}</p>}
  </section>;
}

function VideoExplanationAssistant({ video, language, labels: text, handoffLabel, relatedTopics, onSelectTopic }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const recognitionRef = useRef(null);
  const symptoms = video.importantSymptoms?.[language] || video.importantSymptoms?.en || [];
  const precautions = video.precautions?.[language] || video.precautions?.en || [];
  const topicLabels = topics => topics.map(topic => ({ id: topic, label: relatedTopics[categoryIds.indexOf(topic)] || topic }));

  function speak(value) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(value);
    utterance.lang = ({ en: 'en-US', te: 'te-IN', hi: 'hi-IN' })[language];
    window.speechSynthesis.speak(utterance);
  }

  async function submit(event) {
    event.preventDefault();
    const message = question.trim();
    if (!message || busy) return;
    setQuestion(''); setError('');
    setMessages(current => [...current, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const response = await sendAssistantMessage({ message, language, videoId: video._id });
      setMessages(current => [...current, { role: 'assistant', text: response.message }]);
      if (!muted) speak(response.message);
    } catch {
      setError(text.failure);
    } finally {
      setBusy(false);
    }
  }

  function toggleListening() {
    if (listening) { setListening(false); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError(text.unavailable); return; }
    const recognition = new Recognition();
    recognition.lang = ({ en: 'en-US', te: 'te-IN', hi: 'hi-IN' })[language];
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => setQuestion(event.results?.[0]?.[0]?.transcript || '');
    recognition.onerror = event => setError(event.error === 'not-allowed' ? text.denied : text.unavailable);
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    try { recognitionRef.current = recognition; recognition.start(); setListening(true); }
    catch { setError(text.unavailable); }
  }

  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  function continueInVoiceAssistant() {
    window.dispatchEvent(new CustomEvent('aarogya:video-context-open', { detail: {
      language,
      title: video.title?.[language] || video.title?.en || '',
      sourceTitle: video.sourceTitle,
      description: video.description?.[language] || video.description?.en || '',
      explanation: video.explanation?.[language] || video.explanation?.en || '',
      importantSymptoms: symptoms,
      precautions
    } }));
  }

  return <aside className="video-explanation-panel" aria-label={text.title}>
    <header><span aria-hidden="true">✦</span><div><h2>{text.title}</h2><p>{text.grounded}</p></div></header>
    <button type="button" className="video-assistant-handoff" onClick={continueInVoiceAssistant}>{handoffLabel} ↗</button>
    <div className="video-trusted-points">
      {symptoms.length > 0 && <section><h3>{text.symptoms}</h3><ul>{symptoms.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
      <section><h3>{text.precautions}</h3><ul>{precautions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>
    </div>
    {video.relatedTopics?.length > 0 && <section className="video-ai-related"><h3>{text.related}</h3><div>{topicLabels(video.relatedTopics).map(topic => <button type="button" key={topic.id} onClick={() => onSelectTopic(topic.id)}>{topic.label}</button>)}</div></section>}
    <div className="video-ai-messages" aria-live="polite">{messages.map((item, index) => <article key={`${index}-${item.role}`} className={`video-ai-message is-${item.role}`}><p>{item.text}</p>{item.role === 'assistant' && <button type="button" onClick={() => speak(item.text)} aria-label={text.replay} title={text.replay}><RotateCcw size={16}/></button>}</article>)}{busy && <p className="video-ai-thinking" role="status">…</p>}</div>
    <form className="video-ai-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={`video-question-${video._id}`}>{text.hint}</label>
      <textarea id={`video-question-${video._id}`} rows={2} value={question} onChange={event => setQuestion(event.target.value)} placeholder={text.hint} maxLength={2000} disabled={busy}/>
      <div><button type="button" onClick={toggleListening} aria-pressed={listening} aria-label={listening ? text.stop : text.listen} title={listening ? text.stop : text.listen}><Mic size={18}/><span>{listening ? text.stop : text.listen}</span></button><button type="button" onClick={() => { setMuted(value => !value); window.speechSynthesis?.cancel(); }} aria-pressed={muted} aria-label={muted ? text.unmute : text.mute} title={muted ? text.unmute : text.mute}><Volume2 size={18}/><span>{muted ? text.muted : text.mute}</span></button><button type="submit" disabled={busy || !question.trim()}><Send size={17}/><span>{busy ? '…' : text.ask}</span></button></div>
      {error && <p role="alert">{error}</p>}
    </form>
  </aside>;
}
