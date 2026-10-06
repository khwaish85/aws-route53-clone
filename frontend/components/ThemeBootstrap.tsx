"use client";

import { useEffect } from "react";

export function ThemeBootstrap() {
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem("route53-theme"); } catch {}
    const theme = stored === "dark" || stored === "light" ? stored : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  }, []);
  return null;
}
