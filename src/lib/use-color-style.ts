"use client";

import { useSyncExternalStore } from "react";

/** ¿Esta persona usa el estilo "Con color"? (el layout lo deja en <html data-style>) */
export const useColorStyle = () =>
  useSyncExternalStore(
    () => () => {},
    () => document.documentElement.dataset.style === "color",
    () => false,
  );
