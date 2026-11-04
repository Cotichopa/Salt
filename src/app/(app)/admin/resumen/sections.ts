// Las pestañas del Resumen: van en la dirección (?seccion=chop&mes=2026-10), así se pueden recargar
// y se vuelve con "atrás".

export const SECCIONES = [
  { key: "gastos", label: "Gastos" },
  { key: "chop", label: "Chop" },
  { key: "servidor", label: "Servidor" },
] as const;

export type Seccion = (typeof SECCIONES)[number]["key"];

export function resumenHref(seccion: Seccion, month?: string) {
  const params = new URLSearchParams();
  if (seccion !== "gastos") params.set("seccion", seccion);
  if (month) params.set("mes", month);
  const query = params.toString();
  return query ? `/admin/resumen?${query}` : "/admin/resumen";
}
