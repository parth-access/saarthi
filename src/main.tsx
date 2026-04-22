import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import * as Sentry from "@sentry/react";

// 👉 INIT SENTRY (do this BEFORE render)
Sentry.init({
  dsn: "https://0a8d7abadd20eb090be4e0d950ba61ab@o4511264732348416.ingest.us.sentry.io/4511264735035392",
  
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  tracesSampleRate: 1.0, // reduce later (0.2 or something)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  sendDefaultPii: false, // PLEASE keep this false
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

 <button onClick={() => { throw new Error("Test Sentry bro"); }}>
  Break it
</button>