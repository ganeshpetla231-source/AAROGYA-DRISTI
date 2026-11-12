import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, HeartPulse, Home, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/index.js';
import { LanguageSelector } from './LanguageSelector.jsx';
import { topicExperience } from '../data/journeyModules.js';
import { homeModules, topicArtworkAlt } from '../data/homeModules.js';
import { topicLabels } from '../data/topicExperience.js';
import { topicImageManifest, topicIllustrationAttribution } from '../data/topicImageManifest.js';
import './topic-navigation.css';
import './topic-home-images.css';
import './oral-scan-dialog.css';




function useTopicLanguage() {
  const { i18n } = useTranslation();
  const lang = ['en', 'te', 'hi'].includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  return { lang, labels: topicLabels[lang] };
}

function Brand({ labels, home = false }) {
  return <header className="topic-header">
    <Link className="topic-brand" to="/" aria-label={`AAROGYA DRISHTI — ${labels.home}`}>
      <span className="topic-brand-mark" aria-hidden="true">✦</span>
      <span><strong>AAROGYA <em>DRISHTI</em></strong><small>{labels.intro}</small></span>
    </Link>
    <div className="topic-header-actions">
      {!home && <Link className="topic-header-home" to="/"><Home size={15}/><span>{labels.home}</span></Link>}
      <LanguageSelector className="topic-language"/>
    </div>
  </header>;
}

function TopicVisual({ topic, content, lang }) {
  const art = topic.art[lang];
  const viewLabel = i18n.getResource(lang, 'translation', 'topicNavigation.viewImage')?.[lang];
  const fallbackLabels = i18n.getResource(lang, 'translation', 'topicNavigation.fallbackImage')?.[lang];
  const image = topicImageManifest[topic.slug];
  const [imageSource, setImageSource] = useState(image.image);
  const imageElement = useRef(null);
  useLayoutEffect(() => {
    const element = imageElement.current;
    if (!element) return undefined;
    let observer;
    const requestIfVisible = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.top < window.innerHeight + 120 && bounds.bottom > -120) {
        element.loading = 'eager';
        observer?.disconnect();
      }
    };
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          element.loading = 'eager';
          observer.disconnect();
        }
      }, { rootMargin: '120px' });
      observer.observe(element);
    }
    requestIfVisible();
    window.addEventListener('scroll', requestIfVisible, { passive: true });
    window.addEventListener('resize', requestIfVisible);
    return () => {
      window.removeEventListener('scroll', requestIfVisible);
      window.removeEventListener('resize', requestIfVisible);
      observer?.disconnect();
    };
  }, [imageSource]);
  return <figure className="topic-visual" style={{ '--topic-accent': topic.color }}>
    <div className="topic-visual-glow"/>
    <img ref={imageElement} className="topic-visual-image" src={imageSource} alt={imageSource === '/images/topics/illustration-fallback.svg' ? fallbackLabels.alt : image.alt[lang]} loading="lazy" decoding="async" onError={() => setImageSource('/images/topics/illustration-fallback.svg')}/>
    <div className="topic-visual-flow" aria-label={art.join(' → ')}>
      {art.map((label, index) => <span key={label} className="topic-visual-step">
        {index > 0 && <ArrowRight className="topic-visual-arrow" size={14} aria-hidden="true"/>}
        <b>{String(index + 1).padStart(2, '0')}</b>{label}
      </span>)}
    </div>
    <figcaption>{imageSource === '/images/topics/illustration-fallback.svg' ? fallbackLabels.caption : image.caption[lang] || content.caption}<span>{topicIllustrationAttribution[lang]} <span className="topic-image-credit">{imageSource}</span></span><a href={imageSource} target="_blank" rel="noreferrer">{viewLabel} <ArrowUpRight size={12}/></a></figcaption>
  </figure>;
}

export function TopicHome() {
  const { lang, labels } = useTopicLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [selectedModule, setSelectedModule] = useState('');
  const [opening, setOpening] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [activeFinding, setActiveFinding] = useState(0);
  const activationTimer = useRef(null);
  const scanButtonRef = useRef(null);
  const closeScanButtonRef = useRef(null);
  const scanWasOpen = useRef(false);
  const positions = homeModules.map((_, index) => {
    const angle = (-90 + index * (360 / homeModules.length)) * Math.PI / 180;
    return { x: 50 + 41 * Math.cos(angle), y: 50 + 41 * Math.sin(angle) };
  });
  const infographicAlt = i18n.getResource(lang, 'translation', 'topicNavigation.infographicAlt')?.[lang];
  const scanCopy = i18n.getResource(lang, 'translation', 'topicNavigation.scanCopy')?.[lang];

  useEffect(() => {
    setExpanded(true);
  }, [location.search]);

  useEffect(() => () => window.clearTimeout(activationTimer.current), []);

  useEffect(() => {
    if (!scanOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeScanButtonRef.current?.focus();
    const closeOnEscape = event => {
      if (event.key === 'Escape') setScanOpen(false);
      if (event.key === 'Tab') {
        event.preventDefault();
        closeScanButtonRef.current?.focus();
      }
    };
    const highlightTimer = window.setInterval(() => {
      setActiveFinding(current => (current + 1) % scanCopy.findings.length);
    }, 1700);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearInterval(highlightTimer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [scanOpen, scanCopy.findings.length]);

  useEffect(() => {
    if (scanOpen) {
      scanWasOpen.current = true;
    } else if (scanWasOpen.current) {
      scanWasOpen.current = false;
      scanButtonRef.current?.focus();
    }
  }, [scanOpen]);

  function activateModule(module) {
    if (opening) return;
    setSelectedModule(module.id);
    setOpening(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activationTimer.current = window.setTimeout(() => {
      setOpening(false);
      if (module.action === 'voice') {
        document.querySelector('.voice-dock-trigger')?.click();
        return;
      }
      if (module.action === 'offline') {
        document.querySelector('.offline-status-trigger')?.click();
        return;
      }
      navigate(`/login?module=${encodeURIComponent(module.id)}`);
    }, reducedMotion ? 0 : 1150);
  }

  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !opening && !scanOpen) setExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded, opening, scanOpen]);

  return <main className="topic-home">
    <div className="topic-ambient topic-ambient-one"/><div className="topic-ambient topic-ambient-two"/>
    <Brand labels={labels} home/>
    <p className="topic-home-instruction">{labels.instruction}</p>
    <section className={`topic-radial-stage ${expanded ? 'is-expanded' : ''} ${opening ? 'is-opening' : ''}`} aria-label={labels.topics}>
      <div className="topic-stage-orbit topic-stage-orbit-outer" aria-hidden="true"/>
      <div className="topic-stage-orbit topic-stage-orbit-inner" aria-hidden="true"/>
      {expanded && <svg className="topic-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><filter id="topic-line-glow"><feGaussianBlur stdDeviation=".55" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        {positions.map((point, index) => <line key={homeModules[index].id} x1="50" y1="50" x2={point.x} y2={point.y} style={{ '--topic-accent': index % 2 ? '#0fb5b5' : '#ff8c42', '--reveal-delay': `${index * 45}ms` }}/>)}
      </svg>}
      {expanded && <button className="topic-close" type="button" onClick={() => setExpanded(false)} disabled={opening} aria-label={labels.home}><X size={17}/></button>}
      <button ref={scanButtonRef} className={`topic-mouth-button ${opening ? 'is-scanning' : ''}`} type="button" onClick={() => { if (!opening) { setActiveFinding(0); setScanOpen(true); } }} disabled={opening} aria-haspopup="dialog" aria-label={scanCopy.title}>
        <span className="topic-mouth-platform" aria-hidden="true">
          <img className="topic-home-scan-image" src="/images/oral-screening-infographic.png" alt={infographicAlt} width="825" height="542" decoding="async"/>
          <span className="topic-home-scan-overlay" aria-hidden="true"/>
        </span>
        <span className="topic-mouth-ring topic-mouth-ring-one" aria-hidden="true"/><span className="topic-mouth-ring topic-mouth-ring-two" aria-hidden="true"/>
        <span className="topic-mouth-label"><strong>AAROGYA DRISHTI</strong><small>{i18n.getResource(lang, 'translation', 'topicNavigation.connectedCare')}</small></span>
      </button>
      {expanded && homeModules.map((module, index) => {
        const Icon = module.Icon;
        const title = module.title[lang];
        const accent = index % 2 ? '#0fb5b5' : '#ff8c42';
        return <button key={module.id} className={`topic-radial-card ${selectedModule === module.id ? 'is-selected' : ''}`} type="button" onClick={() => activateModule(module)} disabled={opening} aria-pressed={selectedModule === module.id} style={{ '--topic-accent': accent, '--topic-x': `${positions[index].x}%`, '--topic-y': `${positions[index].y}%`, '--reveal-delay': `${index * 45}ms` }}>
          <span className="topic-card-art"><img src={module.image} alt={topicArtworkAlt(module.id, lang)} loading="lazy" decoding="async"/><span className="topic-card-icon"><Icon size={13} aria-hidden="true"/></span></span>
          <span className="topic-card-copy"><small>{String(index + 1).padStart(2, '0')}</small><strong>{title}</strong></span>
          <ArrowUpRight className="topic-card-arrow" size={15} aria-hidden="true"/>
        </button>;
      })}
    </section>
    <p className="visually-hidden" role="status" aria-live="polite">{opening ? `${homeModules.find(module => module.id === selectedModule)?.title[lang] || ''} — ${i18n.getResource(lang, 'translation', 'topicNavigation.openingModule')}` : ''}</p>
    <button className="topic-home-hint" type="button" onClick={() => { if (!opening) setExpanded(value => !value); }} disabled={opening} aria-expanded={expanded}>
      {expanded ? labels.back : labels.explore}
    </button>
    <Link className="topic-portal-link" to="/login" aria-disabled={opening} onClick={event => { if (opening) event.preventDefault(); }}>{labels.openPortal}<ArrowUpRight size={14}/></Link>
    <p className="topic-medical-disclaimer">{labels.disclaimer}</p>
    {scanOpen && <div className="oral-scan-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setScanOpen(false); }}>
      <section className="oral-scan-dialog" role="dialog" aria-modal="true" aria-labelledby="oral-scan-title" aria-describedby="oral-scan-description">
        <header className="oral-scan-dialog-header">
          <div><p>{scanCopy.subtitle}</p><h2 id="oral-scan-title">{scanCopy.title}</h2></div>
          <button ref={closeScanButtonRef} className="oral-scan-close" type="button" aria-label={scanCopy.close} onClick={() => setScanOpen(false)}><X size={20}/></button>
        </header>
        <div className="oral-scan-dialog-content">
          <figure className="oral-scan-image-frame">
            <img src="/images/oral-screening-infographic.png" alt={infographicAlt} width="825" height="542"/>
            <figcaption>{scanCopy.description}</figcaption>
          </figure>
          <div className="oral-scan-analysis">
            <div className="oral-scan-result"><span className="oral-scan-result-icon"><HeartPulse size={19}/></span><span><small>{scanCopy.subtitle}</small><strong>{scanCopy.result}</strong></span></div>
            <div className="oral-scan-confidence"><span>{scanCopy.confidence}</span><b>98.7%</b><i aria-hidden="true"><span/></i></div>
            <h3>{lang === 'te' ? 'సమీక్ష ప్రాంతాలు' : lang === 'hi' ? 'समीक्षा क्षेत्र' : 'Review areas'}</h3>
            <ul className="oral-scan-findings">
              {scanCopy.findings.map((finding, index) => <li key={finding} className={index === activeFinding ? 'is-active' : ''} aria-current={index === activeFinding ? 'step' : undefined}>
                <span className="oral-scan-finding-indicator" aria-hidden="true"/>
                <span><strong>{finding}</strong><small>{scanCopy.findingNotes[index]}</small></span>
              </li>)}
            </ul>
            <p id="oral-scan-description" className="oral-scan-disclaimer">{scanCopy.disclaimer}</p>
          </div>
        </div>
      </section>
    </div>}
  </main>;
}

export function TopicDetail() {
  const { slug } = useParams();
  const { lang, labels } = useTopicLanguage();
  const navigate = useNavigate();
  const topic = topicExperience.find(item => item.slug === slug);

  if (!topic) return <main className="topic-not-found"><p>404</p><h1>{labels.notFound}</h1><Link to="/">{labels.home}</Link></main>;

  const content = topic.content[lang];
  const Icon = topic.Icon;
  const related = topic.related.map(id => topicExperience.find(item => item.slug === id)).filter(Boolean);

  return <main className="topic-detail-page" style={{ '--topic-accent': topic.color }}>
    <div className="topic-ambient topic-ambient-one"/><div className="topic-ambient topic-ambient-two"/>
    <Brand labels={labels}/>
    <nav className="topic-breadcrumb" aria-label={labels.breadcrumb}><Link to="/">{labels.home}</Link><span>/</span><Link to="/?topics=1">{labels.topics}</Link><span>/</span><span aria-current="page">{content.title}</span></nav>
    <article className="topic-detail">
      <header className="topic-detail-hero">
        <div className="topic-detail-copy">
          <p className="topic-eyebrow"><span>{String(topicExperience.indexOf(topic) + 1).padStart(2, '0')}</span>{labels.learn}</p>
          <h1>{content.title}</h1>
          <p className="topic-detail-intro">{content.intro}</p>
          <p className={`topic-implementation-status ${topic.slug === 'ai-lesion-detection' || topic.slug === 'maps-navigation' ? 'is-demo' : ''}`} role="status"><span aria-hidden="true"/>{topicImageManifest[topic.slug].status[lang]}</p>
        </div>
        <TopicVisual key={topic.slug} topic={topic} content={content} lang={lang}/>
      </header>
      <section className="topic-content-panel">
        <div className="topic-content-heading"><Icon size={19}/><h2>{labels.overview}</h2></div>
        <p>{content.overview}</p>
      </section>
      <div className="topic-detail-columns">
        <section className="topic-detail-section">
          <h2>{labels.learn}</h2>
          <ul className="topic-feature-list">{content.features.map(feature => <li key={feature}><Check size={16}/><span>{feature}</span></li>)}</ul>
        </section>
        <section className="topic-detail-section">
          <h2>{labels.workflow}</h2>
          <ol className="topic-workflow">{content.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol>
        </section>
      </div>
      {topic.clinical && <>
        <section className="topic-clinical-guide">
          <div className="topic-content-heading"><HeartPulse size={19}/><h2>{topic.clinical[lang].title}</h2></div>
          <p className="topic-clinical-intro">{topic.clinical[lang].intro}</p>
          <div className="topic-clinical-grid">{topic.clinical[lang].sections.map(([heading, body]) => <section key={heading}><h3>{heading}</h3><p>{body}</p></section>)}</div>
          <p className="topic-ai-warning">{topic.clinical[lang].warning}</p>
          <div className="topic-source-list"><h3>{labels.sources}</h3>{topic.clinical[lang].sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={13}/></a>)}</div>
        </section>
      </>}
      {topic.slug === 'ai-lesion-detection' && <p className="topic-urgent-note">{labels.clinicalWarning}</p>}
      <section className="topic-benefits">
        <h2>{labels.benefits}</h2>
        <div className="topic-benefit-grid">{Object.entries(content.benefits).map(([role, text]) => <article key={role}><span>{labels.roles[role]}</span><p>{text}</p></article>)}</div>
      </section>
      <nav className="topic-related" aria-label={labels.related}>
        <h2>{labels.related}</h2>
        <div>{related.map(item => {
          const RelatedIcon = item.Icon;
          return <Link key={item.slug} to={`/topics/${item.slug}`}><RelatedIcon size={16}/><span>{item.content[lang].title}</span><ArrowUpRight size={14}/></Link>;
        })}</div>
      </nav>
      <div className="topic-detail-actions">
        <button type="button" onClick={() => navigate('/?topics=1')}><ArrowLeft size={16}/>{labels.back}</button>
        <button type="button" onClick={() => navigate('/')}><Home size={15}/>{labels.home}</button>
        <Link to="/login" className="topic-module-link"><Icon size={15}/>{labels.openPortal}<ArrowUpRight size={13}/></Link>
      </div>
    </article>
    <footer className="topic-detail-footer">{labels.disclaimer}</footer>
  </main>;
}
