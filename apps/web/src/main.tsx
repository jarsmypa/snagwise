import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SharePage } from "./SharePage";
import "./styles.css";

// /s/:id is the public page behind a recommendation QR; everything else is the app.
const shareId = /^\/s\/([a-z0-9]+)$/.exec(location.pathname)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>{shareId ? <SharePage id={shareId} /> : <App />}</StrictMode>,
);
