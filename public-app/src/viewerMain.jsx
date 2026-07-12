import React from "react";
import { createRoot } from "react-dom/client";
import { ViewerApp } from "./ViewerApp.jsx";
import "./viewerStyles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ViewerApp />
  </React.StrictMode>,
);
