"use client";

import { useSyncExternalStore } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

const subscribe = () => () => {}; // no cambia mientras la página está abierta

/** ¿El navegador permite entrar con huella? undefined en el servidor (todavía no se sabe) */
export function useWebAuthnSupport() {
  return useSyncExternalStore<boolean | undefined>(subscribe, browserSupportsWebAuthn, () => undefined);
}
