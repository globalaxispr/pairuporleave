import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Asynchronously load Google Fonts without blocking initial render or triggering CSP violations
if (typeof document !== "undefined") {
  const fontUrl = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap";
  const existing = document.querySelector(`link[href="${fontUrl}"]`);
  if (!existing) {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = fontUrl;
    document.head.appendChild(fontLink);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
