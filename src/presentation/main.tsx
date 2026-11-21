import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';

declare const __SAFE_PWA_ENABLED__: boolean;

if (__SAFE_PWA_ENABLED__ && window.isSecureContext && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/safe-service-worker.js')
    .catch((error: unknown) => {
      console.error('Échec de l’enregistrement du mode installable SAFE.', error);
    });
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
