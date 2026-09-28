import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });
      console.log('[PWA] ✅ Service Worker registered successfully');
      
      // Force update check
      registration.update();
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        console.log('[PWA] New version available');
      });
    } catch (error) {
      console.error('[PWA] ❌ Service Worker registration failed:', error);
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
