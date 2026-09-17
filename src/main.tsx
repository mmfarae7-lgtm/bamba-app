import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA — تثبيت التطبيق على أندرويد وآيفون وأي جهاز حديث + العمل دون اتصال.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // التطبيق يعمل بشكل طبيعي حتى لو تعذر تسجيل الـ Service Worker
    });
  });
}
