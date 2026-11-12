const original = {
  en: 'Original AAROGYA DRISHTI vector illustration; no patient image or external artwork.',
  te: 'AAROGYA DRISHTI కోసం రూపొందించిన అసలు వెక్టర్ చిత్రం; రోగి ఫోటో లేదా బాహ్య చిత్రం కాదు.',
  hi: 'AAROGYA DRISHTI का मूल वेक्टर चित्र; इसमें रोगी की फ़ोटो या बाहरी कलाकृति नहीं है।'
};
const clinicalReferences = [
  { label: 'WHO: Oral health', url: 'https://www.who.int/news-room/fact-sheets/detail/oral-health' },
  { label: 'NCI: Lip and Oral Cavity Cancer', url: 'https://www.cancer.gov/types/head-and-neck/patient/adult/lip-mouth-treatment-pdq' },
  { label: 'NHS: Mouth cancer', url: 'https://www.nhs.uk/conditions/mouth-cancer/' }
];

const topicImages = {
  'authentication-roles': {
    image: '/images/topics/identity-access.svg',
    alt: { en: 'Original security illustration with a protected identity shield connected to separate care-role accounts.', te: 'వేర్వేరు సంరక్షణ పాత్ర ఖాతాలకు అనుసంధానమైన రక్షిత గుర్తింపు కవచం అసలు చిత్రం.', hi: 'अलग-अलग देखभाल भूमिकाओं के खातों से जुड़ी सुरक्षित पहचान ढाल का मूल चित्र।' },
    caption: { en: 'Illustrative role access only; no real account or password is shown.', te: 'పాత్ర ఆధారిత అనుమతి వివరణ మాత్రమే; నిజమైన ఖాతా లేదా పాస్‌వర్డ్ లేదు.', hi: 'भूमिका-आधारित पहुँच का उदाहरण; कोई वास्तविक खाता या पासवर्ड नहीं दिखाया गया।' },
    status: { en: 'Implemented · protected routes, JWT authentication and role checks', te: 'అమలులో ఉంది · రక్షిత రూట్లు, JWT ప్రమాణీకరణ, పాత్ర తనిఖీలు', hi: 'लागू · सुरक्षित रूट, JWT प्रमाणीकरण और भूमिका जाँच' },
    sources: []
  },
  'patient-qr': {
    image: '/images/topics/digital-prescription-qr.svg',
    alt: { en: 'Original illustration of a clinician-authored digital prescription beside a consent-based QR access workflow.', te: 'వైద్యుడు నమోదు చేసిన డిజిటల్ ప్రిస్క్రిప్షన్‌ను సమ్మతి ఆధారిత QR యాక్సెస్ విధానంతో చూపే అసలు చిత్రం.', hi: 'चिकित्सक के डिजिटल पर्चे के साथ सहमति-आधारित QR पहुँच प्रक्रिया का मूल चित्र।' },
    caption: { en: 'Illustrative prescription and access workflow; no patient identifier or health record is shown.', te: 'ప్రిస్క్రిప్షన్, యాక్సెస్ విధానం వివరణ మాత్రమే; రోగి గుర్తింపు లేదా ఆరోగ్య రికార్డు లేదు.', hi: 'पर्चे और पहुँच प्रक्रिया का उदाहरण; कोई रोगी पहचान या स्वास्थ्य रिकॉर्ड नहीं दिखाया गया।' },
    status: { en: 'Implemented · clinical prescriptions and consent-based, revocable QR access', te: 'అమలులో ఉంది · క్లినికల్ ప్రిస్క్రిప్షన్‌లు, సమ్మతి ఆధారిత QR యాక్సెస్', hi: 'लागू · क्लिनिकल पर्चे और सहमति-आधारित QR पहुँच' },
    sources: []
  },
  'ai-lesion-detection': {
    image: '/images/topics/oral-screening-review.svg',
    alt: { en: 'Original non-clinical mouth illustration and review card showing that screening findings need clinician assessment.', te: 'స్క్రీనింగ్ సూచనలకు వైద్యుని సమీక్ష అవసరమని చూపే అసలు, వైద్యేతర నోటి చిత్రం మరియు సమీక్ష కార్డు.', hi: 'स्क्रीनिंग संकेतों के लिए चिकित्सक की जाँच आवश्यक दिखाने वाला मूल, गैर-नैदानिक मुँह चित्र और समीक्षा कार्ड।' },
    caption: { en: 'Original educational illustration, not a clinical photograph, model output, or diagnosis.', te: 'అసలు విద్యా చిత్రం మాత్రమే; ఇది వైద్య ఫోటో, మోడల్ ఫలితం లేదా నిర్ధారణ కాదు.', hi: 'मूल शैक्षिक चित्र; यह चिकित्सकीय फ़ोटो, मॉडल परिणाम या निदान नहीं है।' },
    status: { en: 'Demonstration only · AI adapter is not clinically validated', te: 'డెమో మాత్రమే · AI అడాప్టర్ వైద్యపరంగా ధృవీకరించబడలేదు', hi: 'केवल डेमो · AI एडाप्टर चिकित्सकीय रूप से मान्य नहीं है' },
    sources: clinicalReferences
  },
  'oral-health-education': {
    image: '/images/topics/oral-health-education.svg',
    alt: { en: 'Original illustration combining an oral health awareness graphic and an educational health guide.', te: 'నోటి ఆరోగ్య అవగాహన చిత్రాన్ని విద్యా ఆరోగ్య మార్గదర్శితో కలిపిన అసలు చిత్రం.', hi: 'मुँह स्वास्थ्य जागरूकता चित्र और शैक्षिक स्वास्थ्य मार्गदर्शिका का मूल चित्र।' },
    caption: { en: 'Illustrative education content; it does not assess or diagnose a person.', te: 'విద్యా సమాచారం వివరణ మాత్రమే; ఇది వ్యక్తిని పరీక్షించదు లేదా నిర్ధారించదు.', hi: 'शैक्षिक जानकारी का उदाहरण; यह किसी व्यक्ति की जाँच या निदान नहीं है।' },
    status: { en: 'Implemented · multilingual oral health education library', te: 'అమలులో ఉంది · బహుభాషా నోటి ఆరోగ్య విద్యా లైబ్రరీ', hi: 'लागू · बहुभाषी मुँह स्वास्थ्य शिक्षा लाइब्रेरी' },
    sources: clinicalReferences
  },
  'voice-assistant': {
    image: '/images/topics/voice-language.svg',
    alt: { en: 'Original phone and microphone illustration with a voice waveform and multilingual speech waves.', te: 'వాయిస్ తరంగరూపం, బహుభాషా మాటల తరంగాలతో ఫోన్, మైక్రోఫోన్ అసలు చిత్రం.', hi: 'आवाज़ तरंग और बहुभाषी बोलने की तरंगों वाला फ़ोन और माइक्रोफ़ोन का मूल चित्र।' },
    caption: { en: 'Illustrative voice interface; speech recognition support depends on the browser.', te: 'వాయిస్ ఇంటర్‌ఫేస్ వివరణ మాత్రమే; మాట గుర్తింపు బ్రౌజర్‌పై ఆధారపడి ఉంటుంది.', hi: 'वॉइस इंटरफ़ेस का उदाहरण; वाक् पहचान ब्राउज़र पर निर्भर करती है।' },
    status: { en: 'Implemented · browser speech tools and multilingual text assistant', te: 'అమలులో ఉంది · బ్రౌజర్ మాట సాధనాలు, బహుభాషా టెక్స్ట్ సహాయకుడు', hi: 'लागू · ब्राउज़र वाक् टूल और बहुभाषी टेक्स्ट सहायक' },
    sources: []
  },
  'doctor-dashboard': {
    image: '/images/topics/doctor-workspace.svg',
    alt: { en: 'Original clinical workspace illustration with a patient summary, review chart, and care indicators.', te: 'రోగి సారాంశం, సమీక్ష చార్ట్, సంరక్షణ సూచికలతో కూడిన క్లినికల్ వర్క్‌స్పేస్ అసలు చిత్రం.', hi: 'रोगी सारांश, समीक्षा चार्ट और देखभाल संकेतकों वाला क्लिनिकल कार्यक्षेत्र का मूल चित्र।' },
    caption: { en: 'Illustrative doctor workspace; no real patient information is included.', te: 'వైద్యుని వర్క్‌స్పేస్ వివరణ మాత్రమే; నిజమైన రోగి సమాచారం లేదు.', hi: 'डॉक्टर कार्यक्षेत्र का उदाहरण; इसमें रोगी की वास्तविक जानकारी नहीं है।' },
    status: { en: 'Implemented · role-protected clinical review and follow-up workspace', te: 'అమలులో ఉంది · పాత్ర రక్షిత క్లినికల్ సమీక్ష, ఫాలో-అప్ వర్క్‌స్పేస్', hi: 'लागू · भूमिका-सुरक्षित क्लिनिकल समीक्षा और फ़ॉलो-अप कार्यक्षेत्र' },
    sources: []
  },
  'maps-navigation': {
    image: '/images/topics/rural-care-map.svg',
    alt: { en: 'Original schematic village-care illustration connecting community locations to health facilities.', te: 'సమాజ ప్రాంతాలను ఆరోగ్య కేంద్రాలతో కలిపే అసలు గ్రామీణ సంరక్షణ స్కీమాటిక్ చిత్రం.', hi: 'समुदाय के स्थानों को स्वास्थ्य केंद्रों से जोड़ने वाला मूल योजनात्मक ग्रामीण देखभाल चित्र।' },
    caption: { en: 'Schematic only; map pins, facility names, routes, and travel estimates in the demo are sample data.', te: 'స్కీమాటిక్ మాత్రమే; డెమోలోని మ్యాప్ గుర్తులు, కేంద్రాలు, మార్గాలు, ప్రయాణ అంచనాలు నమూనా డేటా.', hi: 'केवल योजनात्मक चित्र; डेमो के नक्शे, केंद्र, मार्ग और यात्रा अनुमान नमूना डेटा हैं।' },
    status: { en: 'Demo facilities · referral saving is connected to the care record', te: 'డెమో కేంద్రాలు · రిఫరల్ సేవ్ సంరక్షణ రికార్డుకు అనుసంధానమైంది', hi: 'डेमो केंद्र · रेफरल देखभाल रिकॉर्ड से जुड़ा है' },
    sources: []
  },
  telemedicine: {
    image: '/images/topics/telemedicine-visit.svg',
    alt: { en: 'Original illustration of two people in a remote consultation video interface.', te: 'దూర సంప్రదింపు వీడియో ఇంటర్‌ఫేస్‌లో ఇద్దరు వ్యక్తుల అసలు చిత్రం.', hi: 'दूरस्थ परामर्श वीडियो इंटरफ़ेस में दो लोगों का मूल चित्र।' },
    caption: { en: 'Illustrative consultation screen; actual visits require both participants and network access.', te: 'సంప్రదింపు తెర వివరణ మాత్రమే; నిజమైన సందర్శనకు ఇద్దరు పాల్గొనేవారు, నెట్‌వర్క్ అవసరం.', hi: 'परामर्श स्क्रीन का उदाहरण; वास्तविक मुलाक़ात के लिए दोनों प्रतिभागी और नेटवर्क आवश्यक हैं।' },
    status: { en: 'Implemented · appointment, signaling, video, chat and clinical notes', te: 'అమలులో ఉంది · అపాయింట్‌మెంట్, సిగ్నలింగ్, వీడియో, చాట్, క్లినికల్ నోట్లు', hi: 'लागू · अपॉइंटमेंट, सिग्नलिंग, वीडियो, चैट और क्लिनिकल नोट्स' },
    sources: []
  },
  'notifications-analytics': {
    image: '/images/topics/analytics-reminders.svg',
    alt: { en: 'Original analytics dashboard and phone reminder illustration with aggregate charts and a notification.', te: 'సమగ్ర చార్ట్‌లు, నోటిఫికేషన్‌తో కూడిన అసలు విశ్లేషణ డ్యాష్‌బోర్డ్ మరియు ఫోన్ రిమైండర్ చిత్రం.', hi: 'समेकित चार्ट और सूचना वाले मूल विश्लेषण डैशबोर्ड तथा फ़ोन रिमाइंडर का चित्र।' },
    caption: { en: 'Illustrative dashboard; live analytics are aggregate records and exclude patient identifiers.', te: 'డ్యాష్‌బోర్డ్ వివరణ మాత్రమే; ప్రత్యక్ష విశ్లేషణ సమగ్ర రికార్డులపై ఆధారపడి, రోగి గుర్తింపులను చూపదు.', hi: 'डैशबोर्ड का उदाहरण; लाइव विश्लेषण समेकित रिकॉर्ड पर आधारित है और रोगी पहचान नहीं दिखाता।' },
    status: { en: 'Implemented · authenticated notifications and aggregate database analytics', te: 'అమలులో ఉంది · ప్రమాణీకరించిన నోటిఫికేషన్‌లు, సమగ్ర డేటాబేస్ విశ్లేషణ', hi: 'लागू · प्रमाणित सूचनाएँ और समेकित डेटाबेस विश्लेषण' },
    sources: []
  },
  'security-deployment': {
    image: '/images/topics/security-cloud.svg',
    alt: { en: 'Original secure-system illustration showing a central protected service connected to separated infrastructure components.', te: 'వేరు చేసిన మౌలిక సదుపాయ భాగాలకు అనుసంధానమైన రక్షిత సేవను చూపే అసలు సురక్షిత వ్యవస్థ చిత్రం.', hi: 'अलग-अलग अवसंरचना भागों से जुड़ी सुरक्षित सेवा दिखाने वाला मूल सुरक्षा चित्र।' },
    caption: { en: 'Illustrative security architecture, not a live infrastructure diagram or deployment attestation.', te: 'భద్రతా నిర్మాణ వివరణ మాత్రమే; ఇది ప్రత్యక్ష మౌలిక సదుపాయ చిత్రం లేదా డిప్లాయ్‌మెంట్ ధృవీకరణ కాదు.', hi: 'सुरक्षा संरचना का उदाहरण; यह लाइव अवसंरचना चित्र या तैनाती प्रमाण नहीं है।' },
    status: { en: 'Implemented · core auth, access controls and audit; deployment requires operator configuration', te: 'అమలులో ఉంది · ప్రాథమిక ప్రమాణీకరణ, యాక్సెస్ నియంత్రణ, ఆడిట్; డిప్లాయ్‌మెంట్‌కు ఆపరేటర్ సెటప్ అవసరం', hi: 'लागू · मूल प्रमाणीकरण, पहुँच नियंत्रण और ऑडिट; तैनाती के लिए ऑपरेटर सेटअप आवश्यक' },
    sources: []
  }
};

export const topicImageManifest = Object.fromEntries(
  Object.entries(topicImages)
    .filter(([slug]) => !['project-planning', 'frontend-design', 'backend-mongodb'].includes(slug))
    .map(([slug, image]) => [slug, { ...image, sourceUrl: image.image }])
);

export const topicIllustrationAttribution = original;
