import {
  Activity, BookOpenText, CalendarDays, ChartNoAxesColumn, FileHeart, Hospital,
  ScanFace, ShieldCheck, Stethoscope, TriangleAlert, WifiOff
} from 'lucide-react';

const topicArtwork = {
  en: {
    'mouth-scan': 'Illustration of an oral screening review',
    'symptoms-checker': 'Illustration for oral health education and symptom guidance',
    'oral-diseases': 'Illustration for oral health education',
    'ai-screening': 'Illustration of a screening result awaiting clinician review',
    'doctor-consultation': 'Illustration of a doctor reviewing a care workspace',
    appointments: 'Illustration of a video consultation',
    'patient-history': 'Illustration of a doctor workspace with patient record summaries',
    'health-tips': 'Illustration for oral health education and prevention',
    'screening-reports': 'Illustration of analytics and care reminders',
    'nearby-facilities': 'Illustration of a rural care map',
    'offline-accessibility': 'Illustration of secure digital care access'
  },
  te: {
    'mouth-scan': 'నోటి స్క్రీనింగ్ సమీక్ష చిత్రం',
    'symptoms-checker': 'నోటి ఆరోగ్య విద్య, లక్షణాల మార్గదర్శక చిత్రం',
    'oral-diseases': 'నోటి ఆరోగ్య విద్య చిత్రం',
    'ai-screening': 'వైద్య సమీక్ష కోసం వేచి ఉన్న స్క్రీనింగ్ ఫలితాల చిత్రం',
    'doctor-consultation': 'వైద్య సంరక్షణ వర్క్‌స్పేస్‌ను సమీక్షిస్తున్న చిత్రం',
    appointments: 'వీడియో సంప్రదింపు చిత్రం',
    'patient-history': 'రోగి రికార్డు సారాంశాలతో వైద్య వర్క్‌స్పేస్ చిత్రం',
    'health-tips': 'నోటి ఆరోగ్య విద్య, నివారణ చిత్రం',
    'screening-reports': 'విశ్లేషణలు, సంరక్షణ గుర్తుచూపుల చిత్రం',
    'nearby-facilities': 'గ్రామీణ సంరక్షణ మ్యాప్ చిత్రం',
    'offline-accessibility': 'సురక్షిత డిజిటల్ సంరక్షణ యాక్సెస్ చిత్రం'
  },
  hi: {
    'mouth-scan': 'मुँह की स्क्रीनिंग समीक्षा का चित्र',
    'symptoms-checker': 'मुँह स्वास्थ्य शिक्षा और लक्षण मार्गदर्शन का चित्र',
    'oral-diseases': 'मुँह स्वास्थ्य शिक्षा का चित्र',
    'ai-screening': 'चिकित्सक समीक्षा की प्रतीक्षा कर रहे स्क्रीनिंग परिणाम का चित्र',
    'doctor-consultation': 'चिकित्सकीय देखभाल कार्यक्षेत्र की समीक्षा का चित्र',
    appointments: 'वीडियो परामर्श का चित्र',
    'patient-history': 'रोगी रिकॉर्ड सारांश वाले चिकित्सकीय कार्यक्षेत्र का चित्र',
    'health-tips': 'मुँह स्वास्थ्य शिक्षा और बचाव का चित्र',
    'screening-reports': 'विश्लेषण और देखभाल अनुस्मारक का चित्र',
    'nearby-facilities': 'ग्रामीण देखभाल मानचित्र का चित्र',
    'offline-accessibility': 'सुरक्षित डिजिटल देखभाल पहुँच का चित्र'
  }
};

const topicImages = {
  'mouth-scan': '/images/topics/oral-screening-review.svg',
  'symptoms-checker': '/images/topics/oral-health-education.svg',
  'oral-diseases': '/images/topics/oral-health-education.svg',
  'ai-screening': '/images/topics/oral-screening-review.svg',
  'doctor-consultation': '/images/topics/doctor-workspace.svg',
  appointments: '/images/topics/telemedicine-visit.svg',
  'patient-history': '/images/topics/doctor-workspace.svg',
  'health-tips': '/images/topics/oral-health-education.svg',
  'screening-reports': '/images/topics/analytics-reminders.svg',
  'nearby-facilities': '/images/topics/rural-care-map.svg',
  'offline-accessibility': '/images/topics/security-cloud.svg'
};

export const homeModules = [
  { id: 'mouth-scan', Icon: ScanFace, image: topicImages['mouth-scan'], page: 'screening-upload', title: { en: 'Mouth Health Scan', te: 'నోటి ఆరోగ్య స్కాన్', hi: 'मुँह स्वास्थ्य स्कैन' } },
  { id: 'symptoms-checker', Icon: TriangleAlert, image: topicImages['symptoms-checker'], page: 'symptoms-checker', title: { en: 'Symptoms Checker', te: 'లక్షణాల మార్గదర్శి', hi: 'लक्षण मार्गदर्शिका' } },
  { id: 'oral-diseases', Icon: BookOpenText, image: topicImages['oral-diseases'], page: 'education', title: { en: 'Oral Diseases Information', te: 'నోటి వ్యాధుల సమాచారం', hi: 'मुँह के रोगों की जानकारी' } },
  { id: 'ai-screening', Icon: Activity, image: topicImages['ai-screening'], page: 'screening-upload', title: { en: 'AI-Assisted Screening', te: 'AI సహాయంతో స్క్రీనింగ్', hi: 'AI-सहायता प्राप्त स्क्रीनिंग' } },
  { id: 'doctor-consultation', Icon: Stethoscope, image: topicImages['doctor-consultation'], page: 'appointments', title: { en: 'Doctor Consultation', te: 'వైద్యుని సంప్రదింపు', hi: 'डॉक्टर से परामर्श' } },
  { id: 'appointments', Icon: CalendarDays, image: topicImages.appointments, page: 'appointments', title: { en: 'Appointments', te: 'అపాయింట్‌మెంట్‌లు', hi: 'अपॉइंटमेंट' } },
  { id: 'patient-history', Icon: FileHeart, image: topicImages['patient-history'], page: 'screening-history', title: { en: 'Patient Medical History', te: 'రోగి వైద్య చరిత్ర', hi: 'रोगी का चिकित्सा इतिहास' } },
  { id: 'health-tips', Icon: ShieldCheck, image: topicImages['health-tips'], page: 'education', title: { en: 'Precautions and Health Tips', te: 'జాగ్రత్తలు, ఆరోగ్య సూచనలు', hi: 'सावधानियाँ और स्वास्थ्य सुझाव' } },
  { id: 'screening-reports', Icon: ChartNoAxesColumn, image: topicImages['screening-reports'], page: 'reports', title: { en: 'Screening Reports', te: 'స్క్రీనింగ్ నివేదికలు', hi: 'स्क्रीनिंग रिपोर्ट' } },
  { id: 'nearby-facilities', Icon: Hospital, image: topicImages['nearby-facilities'], page: 'maps', title: { en: 'Nearby Hospitals and PHCs', te: 'సమీప ఆసుపత్రులు, PHCలు', hi: 'नज़दीकी अस्पताल और PHC' } },
  { id: 'offline-accessibility', Icon: WifiOff, image: topicImages['offline-accessibility'], action: 'offline', title: { en: 'Offline Accessibility Mode', te: 'ఆఫ్‌లైన్ యాక్సెసిబిలిటీ మోడ్', hi: 'ऑफ़लाइन सुलभता मोड' } }
];

export function topicArtworkAlt(id, lang) {
  return topicArtwork[lang]?.[id] || topicArtwork.en[id] || '';
}
