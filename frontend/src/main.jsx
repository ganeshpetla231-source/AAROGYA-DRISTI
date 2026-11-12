import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import './i18n/index.js';
import './i18n/fonts.css';
import './styles.css';
import './application-theme.css';
import './design-system.css';
import './typography.css';

createRoot(document.getElementById('root')).render(<HashRouter><AuthProvider><LanguageProvider><App /></LanguageProvider></AuthProvider></HashRouter>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.error('Could not register the offline application shell.', error);
    });
  });
}
