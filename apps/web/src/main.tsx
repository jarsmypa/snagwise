import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SharePage } from "./SharePage";
import { I18nProvider } from "./i18n";
import "@fontsource/atkinson-hyperlegible-next/400.css";
import "@fontsource/atkinson-hyperlegible-next/700.css";
import "@fontsource/atkinson-hyperlegible-mono/400.css";
import "@fontsource/atkinson-hyperlegible-mono/700.css";
import "./styles.css";

// /s/:id is the public page behind a recommendation QR; everything else is the app.
const shareId = /^\/s\/([a-z0-9]+)$/.exec(location.pathname)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>{shareId ? <SharePage id={shareId} /> : <App />}</I18nProvider>
  </StrictMode>,
);
