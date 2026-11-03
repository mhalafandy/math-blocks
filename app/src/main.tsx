import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PanelApp } from "./components/Panel";
import "mathlive/fonts.css";
import "mathlive/static.css";
import "./styles/app.css";

const isPanel = new URLSearchParams(location.search).has("panel");
if (isPanel) document.documentElement.classList.add("panel-window");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPanel ? <PanelApp /> : <App />}
  </StrictMode>,
);
