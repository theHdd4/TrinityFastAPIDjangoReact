import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

if (import.meta.env.DEV) {
  console.info('[dev] Shared Redis configuration active across services.');
}

createRoot(document.getElementById("root")!).render(<App />);
