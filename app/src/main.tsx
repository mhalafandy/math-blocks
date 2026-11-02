import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "mathlive/fonts.css";
import "mathlive/static.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
