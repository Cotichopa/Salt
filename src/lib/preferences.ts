// Opciones de las preferencias de cada cuenta (se eligen en "Cuenta"). Las usan el servidor y el
// formulario del navegador, así que acá no hay nada de la base.

/** Pantalla con la que abre la app */
export const HOME_PAGES = {
  "/dashboard": "Inicio",
  "/gastos": "Gastos",
  "/fijos": "Fijos",
} as const;
export type HomePage = keyof typeof HOME_PAGES;

export function homePageOf(value: string | null | undefined): HomePage {
  return value && value in HOME_PAGES ? (value as HomePage) : "/dashboard";
}

/**
 * Color principal (botones, selección, foco). Los tonos están elegidos para que el texto encima se
 * lea bien en claro y en oscuro; los valores de cada uno están en globals.css ([data-accent=...]).
 */
export const ACCENT_COLORS = {
  neutral: { label: "Negro", swatch: "#0d0d0d" },
  blue: { label: "Azul", swatch: "#2563eb" },
  green: { label: "Verde", swatch: "#15803d" },
  violet: { label: "Violeta", swatch: "#7c3aed" },
  orange: { label: "Naranja", swatch: "#c2410c" },
} as const;
export type AccentColor = keyof typeof ACCENT_COLORS;

export function accentOf(value: string | null | undefined): AccentColor {
  return value && value in ACCENT_COLORS ? (value as AccentColor) : "neutral";
}
