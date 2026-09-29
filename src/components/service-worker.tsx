"use client";

import { useEffect } from "react";

/** Registra el service worker (public/sw.js), que hace falta para poder instalar Salt en el celular */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
