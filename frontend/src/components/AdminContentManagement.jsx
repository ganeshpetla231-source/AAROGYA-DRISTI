import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Video } from 'lucide-react';
import { EducationLibrary } from './EducationLibrary.jsx';
import { EducationVideoLibrary } from './EducationVideoLibrary.jsx';
import './admin-content-management.css';

export function AdminContentManagement({ language }) {
  const { t } = useTranslation();
  const [section, setSection] = useState('education');

  return <section className="admin-content-management">
    <nav className="admin-content-tabs" aria-label={t('adminDashboard.contentSections')}>
      <button type="button" aria-current={section === 'education' ? 'page' : undefined}
        className={section === 'education' ? 'is-active' : ''} onClick={() => setSection('education')}>
        <BookOpen size={17} aria-hidden="true"/>{t('navigation.education')}
      </button>
      <button type="button" aria-current={section === 'videos' ? 'page' : undefined}
        className={section === 'videos' ? 'is-active' : ''} onClick={() => setSection('videos')}>
        <Video size={17} aria-hidden="true"/>{t('navigation.education-videos')}
      </button>
    </nav>
    {section === 'education'
      ? <EducationLibrary role="admin" language={language}/>
      : <EducationVideoLibrary language={language}/>}
  </section>;
}
