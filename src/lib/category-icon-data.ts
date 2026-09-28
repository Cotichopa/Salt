// Datos de los íconos de las categorías: la clave que se guarda, el emoji "gemelo" que usa Chop en
// WhatsApp y el nombre. Sin React, así los puede usar el servidor (Chop, validaciones, estadísticas).
// Los dibujos de cada ícono (para la web) están en src/components/category-icon.tsx.

export const CATEGORY_ICON_INFO = {
  utensils: { emoji: "🍽️", label: "Cubiertos" },
  hamburger: { emoji: "🍔", label: "Hamburguesa" },
  pizza: { emoji: "🍕", label: "Pizza" },
  sandwich: { emoji: "🥪", label: "Sándwich" },
  croissant: { emoji: "🥐", label: "Medialuna" },
  "ice-cream": { emoji: "🍦", label: "Helado" },
  apple: { emoji: "🍎", label: "Fruta" },
  coffee: { emoji: "☕", label: "Café" },
  beer: { emoji: "🍻", label: "Cerveza" },
  wine: { emoji: "🍷", label: "Vino" },
  cart: { emoji: "🛒", label: "Changuito" },
  bag: { emoji: "🛍️", label: "Bolsa de compras" },
  fuel: { emoji: "⛽", label: "Surtidor" },
  car: { emoji: "🚗", label: "Auto" },
  taxi: { emoji: "🚕", label: "Taxi" },
  bus: { emoji: "🚌", label: "Colectivo" },
  train: { emoji: "🚆", label: "Tren" },
  bike: { emoji: "🚲", label: "Bicicleta" },
  plane: { emoji: "✈️", label: "Avión" },
  palm: { emoji: "🏝️", label: "Vacaciones" },
  house: { emoji: "🏠", label: "Casa" },
  building: { emoji: "🏢", label: "Edificio" },
  sofa: { emoji: "🛋️", label: "Sillón" },
  wrench: { emoji: "🔧", label: "Herramienta" },
  lightbulb: { emoji: "💡", label: "Lamparita" },
  plug: { emoji: "🔌", label: "Enchufe" },
  flame: { emoji: "🔥", label: "Gas" },
  droplet: { emoji: "💧", label: "Agua" },
  wifi: { emoji: "📶", label: "Internet" },
  phone: { emoji: "📱", label: "Celular" },
  laptop: { emoji: "💻", label: "Computadora" },
  tv: { emoji: "📺", label: "Televisión" },
  gamepad: { emoji: "🎮", label: "Juegos" },
  music: { emoji: "🎵", label: "Música" },
  film: { emoji: "🎬", label: "Cine" },
  ticket: { emoji: "🎟️", label: "Entradas" },
  pill: { emoji: "💊", label: "Remedios" },
  stethoscope: { emoji: "🩺", label: "Médico" },
  dumbbell: { emoji: "🏋️", label: "Gimnasio" },
  scissors: { emoji: "✂️", label: "Peluquería" },
  sparkles: { emoji: "✨", label: "Belleza" },
  shirt: { emoji: "👕", label: "Ropa" },
  baby: { emoji: "👶", label: "Bebé" },
  paw: { emoji: "🐾", label: "Mascotas" },
  flower: { emoji: "🌸", label: "Plantas" },
  graduation: { emoji: "🎓", label: "Estudios" },
  book: { emoji: "📚", label: "Libros" },
  palette: { emoji: "🎨", label: "Arte" },
  gift: { emoji: "🎁", label: "Regalos" },
  heart: { emoji: "❤️", label: "Corazón" },
  briefcase: { emoji: "💼", label: "Trabajo" },
  landmark: { emoji: "🏛️", label: "Impuestos" },
  shield: { emoji: "🛡️", label: "Seguros" },
  piggy: { emoji: "🐷", label: "Ahorro" },
  receipt: { emoji: "🧾", label: "Factura" },
  cigarette: { emoji: "🚬", label: "Cigarrillos" },
  package: { emoji: "📦", label: "Caja" },
  tag: { emoji: "🏷️", label: "Etiqueta" },
} satisfies Record<string, { emoji: string; label: string }>;

export type CategoryIconKey = keyof typeof CATEGORY_ICON_INFO;
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON_INFO) as [CategoryIconKey, ...CategoryIconKey[]];

// Categorías viejas (creadas antes de los íconos) solo tienen emoji: buscamos el ícono gemelo.
// El "️" es un carácter invisible que algunos emojis traen y otros no: lo ignoramos.
const stripVariation = (s: string) => s.replace(/️/g, "");
const byEmoji = new Map(
  (Object.entries(CATEGORY_ICON_INFO) as [CategoryIconKey, (typeof CATEGORY_ICON_INFO)[CategoryIconKey]][]).map(([key, v]) => [
    stripVariation(v.emoji),
    key,
  ]),
);

/** El ícono de una categoría: el guardado, o el que corresponde a su emoji, o una etiqueta */
export function resolveCategoryIcon(icon: string | null | undefined, emoji?: string | null): CategoryIconKey {
  if (icon && icon in CATEGORY_ICON_INFO) return icon as CategoryIconKey;
  return (emoji && byEmoji.get(stripVariation(emoji))) || "tag";
}
