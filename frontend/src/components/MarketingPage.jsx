import { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, HeartPulse, Menu, ShieldCheck, Smile, Sparkles, Stethoscope, Video, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './marketing.css';

const services = [
  { icon: Smile, title: 'Everyday oral care', text: 'Practical guidance and screening support to help you take the next step with confidence.' },
  { icon: Stethoscope, title: 'Clinical review', text: 'A clear path from a community screening to a qualified clinician’s review.' },
  { icon: Video, title: 'Care from anywhere', text: 'Connect with care teams through accessible telehealth and local facility information.' },
];
const doctors = [
  { name: 'A conversation about care', specialty: 'Clinician consultation', image: '/images/dashboard/action-consult.png', alt: 'A clinician speaking with a patient' },
  { name: 'Screening with attention', specialty: 'Oral health screening', image: '/images/dashboard/screening-activity.png', alt: 'A clinician examining a patient in a clinic' },
  { name: 'Care that works together', specialty: 'Community care network', image: '/images/dashboard/action-referrals.png', alt: 'Two care professionals greeting each other' },
];
const careTiles = [
  { title: 'A clearer picture of your oral health', image: '/images/dashboard/action-consult.png', tone: 'wide' },
  { title: 'Guidance that meets you where you are', image: '/images/oral-hygiene-brushing-guide.png', tone: 'tall' },
  { title: 'Connected care, closer to home', image: '/images/dashboard/action-consult.png', tone: '' },
  { title: 'Local care, easier to find', image: '/images/dashboard/community-map.png', tone: '' },
];
const plans = [
  { name: 'Community', price: 'FOR EVERYONE', note: 'A welcoming place to begin', items: ['Oral health learning library', 'Find nearby care facilities', 'Private patient profile'] },
  { name: 'Connected care', price: 'PATIENTS', note: 'A little more support, together', popular: true, items: ['Everything in Community', 'Screening and clinician review', 'Appointments and care updates'] },
  { name: 'Care team', price: 'PROVIDERS', note: 'Tools for connected providers', items: ['Role-based clinical workspace', 'Referral and facility tools', 'Secure reporting and insights'] },
];
const imageUrl = path => path;

function MarketingNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const links = [['Services', '/services'], ['Our approach', '/about'], ['Contact', '/contact']];
  return <header className="marketing-nav-wrap"><nav className="marketing-nav" aria-label="Main navigation">
    <Link to="/" className="marketing-brand" onClick={() => setOpen(false)}><span className="brand-emblem"><Smile size={21}/></span><span><b>Aarogya <i>Drishti</i></b><small>Connected oral care</small></span></Link>
    <div className={`marketing-nav-links ${open ? 'is-open' : ''}`}>
      {links.map(([label, href]) => <Link key={href} to={href} className={location.pathname === href ? 'is-active' : ''} onClick={() => setOpen(false)}>{label}</Link>)}
      <Link to="/explore" onClick={() => setOpen(false)}>Explore care</Link>
      <Link to="/login" className="nav-mobile-login" onClick={() => setOpen(false)}>Sign in</Link>
      <Link to="/register" className="nav-mobile-login" onClick={() => setOpen(false)}>Sign up</Link>
    </div>
    <div className="marketing-nav-actions"><Link to="/contact" className="emergency-link"><span>Need support?</span><b>Find care resources <ArrowUpRight size={13}/></b></Link><Link to="/login" className="nav-login">Patient portal <ArrowUpRight size={15}/></Link><Link to="/register" className="nav-login">Sign up <ArrowUpRight size={15}/></Link></div>
    <button className="nav-menu-toggle" type="button" onClick={() => setOpen(value => !value)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open}>{open ? <X/> : <Menu/>}</button>
  </nav></header>;
}

function MarketingFooter() {
  return <footer className="marketing-footer"><div className="footer-main"><Link to="/" className="marketing-brand"><span className="brand-emblem"><Smile size={21}/></span><span><b>Aarogya <i>Drishti</i></b><small>Connected oral care</small></span></Link><p>Thoughtful oral health support, designed to make the next step feel clearer.</p><div className="footer-links"><Link to="/services">Services</Link><Link to="/about">About</Link><Link to="/contact">Contact</Link><Link to="/login">Patient portal</Link><Link to="/explore">Care tools</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Aarogya Drishti</span><span>Care information is educational and does not replace a clinician’s advice.</span></div></footer>;
}

function PageShell({ children }) { return <div className="marketing-site"><MarketingNav/>{children}<MarketingFooter/></div>; }

export function MarketingHome() {
  const navigate = useNavigate();
  return <PageShell><main className="marketing-home">
    <section className="marketing-hero section-wrap">
      <div className="hero-heading-row"><div><p className="eyebrow"><span/> CARE THAT CONNECTS</p><h1>Brighten your smile.<br/><em>Feel cared for.</em> <Smile className="hero-smile" size={34}/></h1></div><div className="hero-intro"><p>Oral health support, screening and trusted care pathways—thoughtfully brought together for you and your community.</p><Link to="/about" className="text-arrow">Get to know us <ArrowUpRight size={16}/></Link></div></div>
      <div className="hero-image-card"><img src="/images/dashboard/action-consult.png" alt="A clinician listening to a patient during a consultation" fetchpriority="high"/><div className="hero-image-wash"/><div className="hero-image-caption"><span className="live-dot"/> Care that starts with listening</div><form className="hero-book-card" onSubmit={event => { event.preventDefault(); navigate('/appointment'); }}><div className="hero-book-heading"><span className="book-icon"><Sparkles size={15}/></span><div><b>Take your next step</b><small>A simple path to connected care</small></div></div><label htmlFor="hero-care-select">What kind of support are you looking for?</label><div className="select-wrap"><select id="hero-care-select" defaultValue=""><option value="" disabled>Choose a care option</option><option>Book a consultation</option><option>Find a nearby clinic</option><option>Learn about oral health</option></select><ChevronDown size={16}/></div><button className="button-lime" type="submit">Explore your care options <ArrowRight size={16}/></button><small className="book-secure"><ShieldCheck size={13}/> Your care journey stays private</small></form></div>
      <div className="hero-bottom-line"><span>CARE FOR EVERY STAGE OF LIFE</span><span>Screening <i/> Education <i/> Clinical review <i/> Local care</span></div>
    </section>

    <section className="services-section section-wrap" id="services"><div className="section-heading"><div><p className="eyebrow">A MORE CONNECTED JOURNEY</p><h2>Care that meets you<br/><em>where you are.</em></h2></div><p>From the first question to the next appointment, find useful support in one welcoming place.</p></div><div className="service-grid">{services.map(({ icon: Icon, title, text }, index) => <article className="service-card" key={title}><div className="service-icon"><Icon size={20}/></div><span className="service-watermark" aria-hidden="true"><svg viewBox="0 0 80 100" focusable="false"><path d="M19 5C9 10 5 19 7 31c2 11 8 17 11 29 3 13 5 31 12 32 7 1 7-25 12-25s5 26 12 25c7-1 9-19 12-32 3-12 9-18 11-29 2-12-2-21-12-26-10-5-17 1-23 1S29 0 19 5Z"/></svg></span><span className="service-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p><Link to={index === 1 ? '/appointment' : '/explore'} aria-label={`Explore ${title}`}><ArrowUpRight size={17}/></Link></article>)}</div><div className="service-footnote"><span><ShieldCheck size={16}/> Privacy-minded by design</span><span>One care journey, shaped around people</span></div></section>

    <section className="why-section"><div className="why-inner section-wrap"><div className="why-copy"><p className="eyebrow">WHY AAROGYA DRISHTI</p><h2>Good care starts<br/>with <em>feeling seen.</em></h2><p>We connect people, care teams and local services through accessible tools that make oral health easier to understand and act on.</p><Link to="/about" className="button-outline">Our approach <ArrowRight size={15}/></Link></div><div className="why-content"><div className="why-points"><article><span><HeartPulse size={17}/></span><b>Care with context</b><small>Useful guidance that respects your situation and language.</small></article><article><span><ShieldCheck size={17}/></span><b>Privacy at every step</b><small>Your health journey is handled with care and respect.</small></article><article><span><Stethoscope size={17}/></span><b>Connected professionals</b><small>Make the path from community care to clinical review clearer.</small></article></div><div className="stat-grid"><article><b>11</b><span>care tools and pathways</span></article><article><b>3</b><span>available languages</span></article><article><b>1</b><span>connected care journey</span></article></div></div></div></section>

    <section className="team-section section-wrap"><div className="section-heading"><div><p className="eyebrow">HERE WHEN YOU NEED US</p><h2>Meet your <em>care team.</em></h2></div><p>Explore the people and services that help make every care decision feel a little simpler.</p></div><div className="team-grid">{doctors.map(doctor => <article className="team-card" key={doctor.name}><div className="team-image"><img src={imageUrl(doctor.image)} alt={doctor.alt} loading="lazy"/><span className="team-badge">Care team</span></div><div className="team-copy"><div><h3>{doctor.name}</h3><p>{doctor.specialty}</p></div><span><ArrowUpRight size={17}/></span></div></article>)}</div><p className="team-note">Care availability depends on your location and the services in your network.</p></section>

    <section className="pricing-section"><div className="section-wrap"><div className="section-heading"><div><p className="eyebrow">CARE, WITHOUT THE GUESSWORK</p><h2>Support for every<br/><em>part of the journey.</em></h2></div><p>Start with the tools you need today. Your care team can help you discover what is available next.</p></div><div className="pricing-grid">{plans.map(plan => <article key={plan.name} className={`pricing-card ${plan.popular ? 'is-popular' : ''}`}>{plan.popular && <span className="popular-badge">MOST POPULAR</span>}<div className="plan-heading"><div><h3>{plan.name}</h3><p>{plan.note}</p></div><b>{plan.price}</b></div><ul>{plan.items.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul><Link to={plan.popular ? '/appointment' : '/login'} className={plan.popular ? 'button-dark' : 'button-outline'}>Choose plan<ArrowRight size={15}/></Link></article>)}</div><p className="pricing-note">Aarogya Drishti is a care platform; services and availability may vary by location.</p></div></section>

    <section className="care-bento section-wrap"><div className="section-heading"><div><p className="eyebrow">SMALL STEPS, BETTER SUPPORTED</p><h2>Let us simplify<br/><em>your care.</em></h2></div><Link to="/explore" className="text-arrow">Explore all care tools <ArrowUpRight size={16}/></Link></div><div className="bento-grid">{careTiles.map((tile, index) => <Link to={index === 0 ? '/appointment' : '/explore'} className={`bento-card ${tile.tone}`} key={tile.title}><img src={imageUrl(tile.image, 1100)} alt="" loading="lazy"/><span className="bento-shade"/><span className="bento-copy"><small>0{index + 1} / YOUR CARE JOURNEY</small><b>{tile.title}</b></span><span className="bento-arrow"><ArrowUpRight size={17}/></span></Link>)}</div></section>

    <section className="closing-cta section-wrap"><div><p className="eyebrow">YOUR NEXT STEP STARTS HERE</p><h2>Let’s make care<br/><em>feel closer.</em></h2><p>Find the right support for you, at a pace that feels comfortable.</p></div><div className="cta-actions"><Link to="/appointment" className="button-lime">Find your care pathway <ArrowRight size={16}/></Link><Link to="/login" className="text-arrow">Already have an account? Sign in <ArrowUpRight size={15}/></Link><Link to="/register" className="text-arrow">New patient? Sign up <ArrowUpRight size={15}/></Link></div><ArrowDownRight className="cta-decoration" size={110}/></section>
  </main></PageShell>;
}

export function MarketingInfoPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const page = pathname.replace('/', '') || 'services';
  const content = {
    services: { eyebrow: 'OUR SERVICES', title: <>Connected care,<br/><em>made clearer.</em></>, intro: 'Explore practical tools and care pathways that support oral health at every step.', image: '/images/dashboard/action-consult.png' },
    about: { eyebrow: 'OUR APPROACH', title: <>People first.<br/><em>Care connected.</em></>, intro: 'Aarogya Drishti brings patients, community workers and clinicians into one thoughtful oral health journey.', image: '/images/dashboard/action-referrals.png' },
    contact: { eyebrow: 'WE ARE HERE TO HELP', title: <>Let’s find your<br/><em>next step.</em></>, intro: 'Tell us what kind of support you need. We will help you find the right care pathway.', image: '/images/dashboard/screening-activity.png' },
  }[page] || { eyebrow: 'YOUR CARE JOURNEY', title: <>Find care that<br/><em>fits your needs.</em></>, intro: 'Choose a path to find the right support for your oral health.', image: '/images/dashboard/action-consult.png' };
  const appointment = page === 'appointment';
  return <PageShell><main className="marketing-info section-wrap"><div className="info-hero"><div><p className="eyebrow">{appointment ? 'BOOK A CARE VISIT' : content.eyebrow}</p><h1>{appointment ? <>A good next step<br/><em>starts right here.</em></> : content.title}</h1><p>{appointment ? 'Choose the kind of support you are looking for. We will guide you to the secure care portal to continue.' : content.intro}</p><div className="info-actions"><Link to={appointment ? '/login?module=doctor-consultation' : '/appointment'} className="button-lime">{appointment ? 'Continue to appointments' : 'Find your care pathway'}<ArrowRight size={16}/></Link>{page !== 'contact' && <Link to="/contact" className="text-arrow">Talk to our team <ArrowUpRight size={15}/></Link>}</div></div><figure><img src={imageUrl(content.image)} alt="A clinician and patient in a care setting"/><figcaption><span className="live-dot"/> Thoughtful care, built around you</figcaption></figure></div>
    {appointment ? <section className="appointment-steps"><p className="eyebrow">A SIMPLE THREE-STEP JOURNEY</p><h2>Find the right care pathway.</h2><div className="steps-grid">{[['01', 'Choose your care', 'Select a consultation or find local support.'], ['02', 'Continue securely', 'Sign in to your patient portal to protect your information.'], ['03', 'Connect with care', 'Review available appointments and next steps.']].map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div><button type="button" className="button-dark" onClick={() => navigate('/login?module=doctor-consultation')}>Continue to secure booking <ArrowRight size={16}/></button></section> : page === 'contact' ? <section className="contact-card"><div><p className="eyebrow">CONTACT AAROGYA DRISHTI</p><h2>Find the right<br/><em>place to start.</em></h2><p>Use the care portal to manage appointments, or explore the care resources available in your area.</p></div><div className="contact-methods"><Link to="/login"><span>Patient portal</span><b>Sign in for care support <ArrowUpRight size={15}/></b></Link><Link to="/explore"><span>Care resources</span><b>Explore the care tools <ArrowUpRight size={15}/></b></Link><Link to="/login?module=doctor-consultation"><span>Appointments</span><b>Continue to booking <ArrowUpRight size={15}/></b></Link></div></section> : <section className="info-detail-grid"><article><span className="info-icon"><ShieldCheck size={19}/></span><h2>Care that feels connected</h2><p>Move from trusted oral health learning to screening and clinical review through one accessible platform.</p></article><article><span className="info-icon"><Smile size={19}/></span><h2>Designed for real life</h2><p>Find practical information, language support and a care team that can help you understand what comes next.</p></article><article><span className="info-icon"><Stethoscope size={19}/></span><h2>Support for care teams</h2><p>Community and clinical tools help people coordinate screening, referrals and follow-up.</p></article></section>}
  </main></PageShell>;
}
