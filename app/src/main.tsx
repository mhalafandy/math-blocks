import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PanelApp } from "./components/Panel";
import { PreviewApp } from "./components/PreviewApp";
import "mathlive/fonts.css";
import "mathlive/static.css";
import "./styles/app.css";

const params = new URLSearchParams(location.search);
const isPanel = params.has("panel");
const isPreview = params.has("preview");
if (isPanel) document.documentElement.classList.add("panel-window");
if (isPreview) document.documentElement.classList.add("preview-window");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPanel ? <PanelApp /> : isPreview ? <PreviewApp /> : <App />}
  </StrictMode>,
);
