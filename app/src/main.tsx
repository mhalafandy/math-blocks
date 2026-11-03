import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PanelApp } from "./components/Panel";
import "mathlive/fonts.css";
import "mathlive/static.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("panel") ? <PanelApp /> : <App />}
  </StrictMode>,
);
