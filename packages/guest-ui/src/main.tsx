import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { BottleShareCard } from "./share/BottleShareCard";
import { ProductShareCard } from "./share/ProductShareCard";
import { RecipeShareCard } from "./share/RecipeShareCard";
import "./index.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root element");
createRoot(el).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/r/:id" element={<RecipeShareCard />} />
        <Route path="/p/:id" element={<ProductShareCard />} />
        <Route path="/b/:id" element={<BottleShareCard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
