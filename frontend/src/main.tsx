import 'leaflet/dist/leaflet.css';
import './estilos/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

// PWA (RF-30): el service worker guarda la aplicación para que abra sin señal.
if ('serviceWorker' in navigator) registerSW({ immediate: true });

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
