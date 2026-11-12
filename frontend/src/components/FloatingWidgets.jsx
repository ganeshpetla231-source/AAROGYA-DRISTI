import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { OfflineAccessibility } from './OfflineAccessibility.jsx';
import { PersistentVoiceAssistant } from './PersistentVoiceAssistant.jsx';

export function FloatingWidgets() {
  const { t } = useTranslation();
  return createPortal(
    <aside className="floating-widget-stack" aria-label={t('accessibility.widgetsLabel')}>
      <OfflineAccessibility/>
      <PersistentVoiceAssistant/>
    </aside>,
    document.body
  );
}
