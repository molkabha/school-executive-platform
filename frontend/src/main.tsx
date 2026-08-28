import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Self-hosted fonts/icons (bundled locally, same-origin). Loading these from
// a cross-origin CDN previously broke PDF export: html2canvas's
// `foreignObjectRendering` mode rasterizes the report via an SVG
// <foreignObject>, and Chromium silently drops cross-origin @font-face
// resources referenced inside it instead of erroring — the canvas comes
// back blank/white while the page count stays correct. Self-hosting removes
// the cross-origin boundary entirely, which is the fix.
import '@fontsource/cairo/300.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/500.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import '@fontsource/ibm-plex-sans-arabic/300.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/noto-kufi-arabic/500.css';
import '@fontsource/noto-kufi-arabic/600.css';
import '@fontsource/noto-kufi-arabic/700.css';
import '@fontsource/noto-kufi-arabic/800.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
