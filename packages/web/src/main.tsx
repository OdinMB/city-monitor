import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { capturePreviewToken } from './lib/preview-token.js';
import './i18n/index.js';
import './globals.css';

// Before the first request: a review link's ?preview= token for HHT's events
capturePreviewToken();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
