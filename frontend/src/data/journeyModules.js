import { BookOpenText } from 'lucide-react';
import { topicExperience as existingTopics } from './topicExperience.js';

const bySlug = Object.fromEntries(existingTopics.map(topic => [topic.slug, topic]));
const orderedSlugs = [
  'ai-lesion-detection',
  'oral-health-education',
  'doctor-dashboard',
  'voice-assistant',
  'telemedicine',
  'maps-navigation',
  'patient-qr',
  'authentication-roles',
  'notifications-analytics',
  'security-deployment'
];

const education = {
  ...bySlug['ai-lesion-detection'],
  slug: 'oral-health-education',
  color: '#46d7c8',
  Icon: BookOpenText,
  art: { en: ['Learn', 'Prevent', 'Seek care'], te: ['తెలుసుకోండి', 'నివారించండి', 'చికిత్స పొందండి'], hi: ['जानें', 'बचाव करें', 'जाँच कराएँ'] },
  related: ['ai-lesion-detection', 'voice-assistant', 'maps-navigation'],
  content: {
    en: {
      ...bySlug['ai-lesion-detection'].content.en,
      title: 'Oral Health Education',
      intro: 'Understand common mouth conditions, reduce preventable risks, and know when a health professional should assess a concern.',
      overview: 'The education library provides plain-language, reviewed information about oral hygiene, ulcers, patches, tobacco risks, screening, and follow-up. Education supports informed care; it cannot diagnose an individual.',
      features: ['Search reviewed articles by condition, symptom, or keyword', 'Browse prevention, oral hygiene, screening, and follow-up guidance', 'Read English, Telugu, and Hindi content and use offline-reviewed articles'],
      steps: ['Choose a language and search or browse a health topic.', 'Read the signs, safe precautions, and when to seek care.', 'Ask a qualified health professional about persistent or concerning symptoms.', 'Follow the clinician’s referral and follow-up advice.'],
      benefits: { patients: 'Clear information for informed conversations with a clinician.', community: 'Consistent education materials for community visits.', clinicians: 'A resource to support—not replace—clinical advice.', administrators: 'Reviewed public education that can be managed by authorized reviewers.' },
      visual: 'Learn, prevent, seek care',
      caption: 'Educational guidance only; this does not assess or diagnose a person.'
    },
    te: {
      ...bySlug['ai-lesion-detection'].content.te,
      title: 'నోటి ఆరోగ్య విద్య',
      intro: 'సాధారణ నోటి సమస్యలను అర్థం చేసుకోండి, నివారించగల ప్రమాదాలను తగ్గించండి, ఎప్పుడు వైద్య పరీక్ష అవసరమో తెలుసుకోండి.',
      overview: 'విద్యా లైబ్రరీ నోటి పరిశుభ్రత, పుండ్లు, మచ్చలు, పొగాకు ప్రమాదాలు, స్క్రీనింగ్, ఫాలో-అప్ గురించి సరళమైన, సమీక్షించిన సమాచారాన్ని అందిస్తుంది. ఇది వ్యక్తిగత నిర్ధారణ కాదు.',
      features: ['సమస్య, లక్షణం లేదా పదంతో సమీక్షించిన వ్యాసాలను వెతకండి', 'నివారణ, నోటి పరిశుభ్రత, స్క్రీనింగ్, ఫాలో-అప్ సూచనలు చూడండి', 'తెలుగు, ఇంగ్లీష్, హిందీలో చదవండి; ఆఫ్‌లైన్‌లో అందుబాటులో ఉన్న వ్యాసాలను ఉపయోగించండి'],
      steps: ['భాష ఎంచుకొని ఆరోగ్య అంశాన్ని వెతకండి లేదా చూడండి.', 'లక్షణాలు, సురక్షిత జాగ్రత్తలు, వైద్య సహాయం ఎప్పుడు పొందాలో చదవండి.', 'కొనసాగుతున్న లేదా ఆందోళన కలిగించే లక్షణాలపై అర్హత కలిగిన ఆరోగ్య నిపుణుడిని సంప్రదించండి.', 'వైద్యుడు సూచించిన రిఫరల్, ఫాలో-అప్ పాటించండి.'],
      benefits: { patients: 'వైద్యుడితో మాట్లాడేందుకు స్పష్టమైన సమాచారం.', community: 'సమాజ సందర్శనలకు స్థిరమైన ఆరోగ్య విద్యా సమాచారం.', clinicians: 'వైద్య సలహాకు తోడ్పడే వనరు; ప్రత్యామ్నాయం కాదు.', administrators: 'అధీకృత సమీక్షకులు నిర్వహించగల సమీక్షించిన ప్రజా సమాచారం.' },
      visual: 'తెలుసుకోండి, నివారించండి, చికిత్స పొందండి',
      caption: 'విద్యా సమాచారం మాత్రమే; ఇది వ్యక్తిని పరీక్షించదు లేదా నిర్ధారించదు.'
    },
    hi: {
      ...bySlug['ai-lesion-detection'].content.hi,
      title: 'मुँह के स्वास्थ्य की शिक्षा',
      intro: 'आम मुँह की समस्याएँ समझें, रोके जा सकने वाले जोखिम घटाएँ और जानें कि स्वास्थ्यकर्मी से जाँच कब करानी चाहिए।',
      overview: 'शिक्षा लाइब्रेरी मुँह की सफ़ाई, छाले, धब्बे, तंबाकू के जोखिम, स्क्रीनिंग और फ़ॉलो-अप पर सरल, समीक्षित जानकारी देती है। यह व्यक्तिगत निदान नहीं करती।',
      features: ['समस्या, लक्षण या शब्द से समीक्षित लेख खोजें', 'बचाव, मुँह की सफ़ाई, स्क्रीनिंग और फ़ॉलो-अप मार्गदर्शन देखें', 'हिंदी, तेलुगु और अंग्रेज़ी में पढ़ें; ऑफ़लाइन उपलब्ध लेखों का उपयोग करें'],
      steps: ['भाषा चुनकर स्वास्थ्य विषय खोजें या ब्राउज़ करें।', 'लक्षण, सुरक्षित सावधानियाँ और देखभाल कब लेनी है पढ़ें।', 'लगातार या चिंताजनक लक्षणों पर योग्य स्वास्थ्य पेशेवर से सलाह लें।', 'चिकित्सक की रेफरल और फ़ॉलो-अप सलाह मानें।'],
      benefits: { patients: 'चिकित्सक से जानकारीपूर्ण बातचीत के लिए स्पष्ट जानकारी।', community: 'समुदाय यात्राओं के लिए एकसमान शिक्षा सामग्री।', clinicians: 'चिकित्सकीय सलाह का समर्थन करने वाला स्रोत, उसका विकल्प नहीं।', administrators: 'अधिकृत समीक्षकों द्वारा प्रबंधित सार्वजनिक स्वास्थ्य जानकारी।' },
      visual: 'जानें, बचाव करें, जाँच कराएँ',
      caption: 'केवल शैक्षिक जानकारी; यह किसी व्यक्ति की जाँच या निदान नहीं है।'
    }
  }
};

const qrTopic = bySlug['patient-qr'];
const qrTitles = {
  en: 'Digital Prescription and QR Code System',
  te: 'డిజిటల్ ప్రిస్క్రిప్షన్, QR కోడ్ వ్యవస్థ',
  hi: 'डिजिटल पर्चा और QR कोड प्रणाली'
};
const qrTopicWithTitle = {
  ...qrTopic,
  related: ['authentication-roles', 'doctor-dashboard', 'telemedicine'],
  content: Object.fromEntries(Object.entries(qrTopic.content).map(([lang, content]) => [
    lang,
    {
      ...content,
      title: qrTitles[lang],
      intro: {
        en: 'Connect clinician-created digital care instructions with consent-based patient identification and authorized record access.',
        te: 'వైద్యుడు రూపొందించిన డిజిటల్ సంరక్షణ సూచనలను సమ్మతి ఆధారిత రోగి గుర్తింపు, అనుమతితో రికార్డు యాక్సెస్‌తో కలపండి.',
        hi: 'चिकित्सक के डिजिटल देखभाल निर्देशों को सहमति-आधारित रोगी पहचान और अधिकृत रिकॉर्ड पहुँच से जोड़ें।'
      }[lang],
      overview: {
        en: 'Authorized clinicians can document prescriptions in the patient record. The QR workflow helps identify a record and request access; it does not place private health details directly in a public QR image. Patients control consent, and access remains role- and relationship-scoped.',
        te: 'అధీకృత వైద్యులు రోగి రికార్డులో ప్రిస్క్రిప్షన్‌లను నమోదు చేయగలరు. QR విధానం రికార్డును గుర్తించి యాక్సెస్ కోరుతుంది; ప్రైవేట్ ఆరోగ్య వివరాలు పబ్లిక్ QR చిత్రంలో ఉండవు. సమ్మతి రోగి నియంత్రణలో ఉంటుంది; యాక్సెస్ పాత్ర, సంబంధం ఆధారంగా పరిమితం అవుతుంది.',
        hi: 'अधिकृत चिकित्सक रोगी रिकॉर्ड में पर्चे दर्ज कर सकते हैं। QR प्रक्रिया रिकॉर्ड पहचानकर पहुँच माँगती है; निजी स्वास्थ्य विवरण सार्वजनिक QR चित्र में नहीं होते। सहमति रोगी के नियंत्रण में रहती है और पहुँच भूमिका व संबंध के अनुसार सीमित होती है।'
      }[lang],
      features: {
        en: ['Clinician-authored prescription and care-plan records', 'Consent-based QR access with revocation support', 'Authenticated scanning, audit history, and relationship checks'],
        te: ['వైద్యుడు నమోదు చేసే ప్రిస్క్రిప్షన్, సంరక్షణ ప్రణాళిక రికార్డులు', 'రద్దు చేయగల సమ్మతి ఆధారిత QR యాక్సెస్', 'ప్రమాణీకరించిన స్కానింగ్, ఆడిట్ చరిత్ర, సంబంధ తనిఖీలు'],
        hi: ['चिकित्सक द्वारा दर्ज पर्चे और देखभाल योजना', 'रद्द की जा सकने वाली सहमति-आधारित QR पहुँच', 'प्रमाणित स्कैनिंग, ऑडिट इतिहास और संबंध जाँच']
      }[lang],
      visual: {
        en: 'Review care · share consent · access securely',
        te: 'సంరక్షణ సమీక్ష · సమ్మతి · సురక్షిత యాక్సెస్',
        hi: 'देखभाल समीक्षा · सहमति · सुरक्षित पहुँच'
      }[lang]
    }
  ]))
};

const requestedModules = orderedSlugs.map(slug => slug === 'oral-health-education' ? education : slug === 'patient-qr' ? qrTopicWithTitle : bySlug[slug]);
const relatedModules = {
  'ai-lesion-detection': ['oral-health-education', 'doctor-dashboard', 'maps-navigation'],
  'oral-health-education': ['ai-lesion-detection', 'voice-assistant', 'maps-navigation'],
  'doctor-dashboard': ['ai-lesion-detection', 'telemedicine', 'patient-qr'],
  'voice-assistant': ['oral-health-education', 'telemedicine', 'ai-lesion-detection'],
  telemedicine: ['doctor-dashboard', 'maps-navigation', 'patient-qr'],
  'maps-navigation': ['doctor-dashboard', 'telemedicine', 'oral-health-education'],
  'patient-qr': ['authentication-roles', 'doctor-dashboard', 'telemedicine'],
  'authentication-roles': ['patient-qr', 'doctor-dashboard', 'security-deployment'],
  'notifications-analytics': ['doctor-dashboard', 'telemedicine', 'security-deployment'],
  'security-deployment': ['authentication-roles', 'patient-qr', 'notifications-analytics']
};

export const topicExperience = requestedModules.map(topic => ({
  ...topic,
  related: relatedModules[topic.slug]
}));
