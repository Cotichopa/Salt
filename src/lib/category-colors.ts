// Los colores de las categorías (se ven con el estilo "Con color"). Los tonos están en globals.css
// (--cat-*), uno para claro y otro para oscuro. Los primeros 8 son los validados con la guía dataviz; los
// otros 6 se eligieron para que no se parezcan a ninguno (el par más parecido sigue siendo azul y celeste).
// Con daltonismo algunos se confunden: por eso siempre van con su ícono o su nombre.

export const CATEGORY_COLORS = {
  azul: "Azul",
  naranja: "Naranja",
  turquesa: "Turquesa",
  ambar: "Ámbar",
  rosa: "Rosa",
  verde: "Verde",
  violeta: "Violeta",
  celeste: "Celeste",
  cielo: "Cielo",
  lima: "Lima",
  cacao: "Cacao",
  magenta: "Magenta",
  bordo: "Bordó",
  arena: "Arena",
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const CATEGORY_COLOR_KEYS = Object.keys(CATEGORY_COLORS) as [CategoryColor, ...CategoryColor[]];

export const categoryColorVar = (color: string) => `var(--cat-${color})`;

/** El color menos usado entre los que ya hay: el que recibe una categoría nueva */
export function leastUsedColor(used: string[]): CategoryColor {
  const count = (color: string) => used.filter((u) => u === color).length;
  return CATEGORY_COLOR_KEYS.reduce((best, color) => (count(color) < count(best) ? color : best));
}

/**
 * Para los gráficos: cada categoría con su color, salvo que otra del mismo gráfico ya lo tenga (ahí
 * le toca uno libre, porque dos porciones iguales no se podrían distinguir).
 */
export function distinctColors(colors: (string | null | undefined)[]) {
  const taken = new Set<string>();
  return colors.map((color) => {
    const own = color && !taken.has(color) ? color : CATEGORY_COLOR_KEYS.find((c) => !taken.has(c)) ?? CATEGORY_COLOR_KEYS[0];
    taken.add(own);
    return categoryColorVar(own);
  });
}
