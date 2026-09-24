import {
  AppleIcon,
  BabyIcon,
  BeerIcon,
  BikeIcon,
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  BusIcon,
  CarIcon,
  CarTaxiFrontIcon,
  CigaretteIcon,
  ClapperboardIcon,
  CoffeeIcon,
  CroissantIcon,
  DropletIcon,
  DumbbellIcon,
  FlameIcon,
  Flower2Icon,
  FuelIcon,
  Gamepad2Icon,
  GiftIcon,
  GraduationCapIcon,
  HamburgerIcon,
  HeartIcon,
  HouseIcon,
  IceCreamConeIcon,
  LandmarkIcon,
  LaptopIcon,
  LightbulbIcon,
  MusicIcon,
  PackageIcon,
  PaletteIcon,
  PawPrintIcon,
  PiggyBankIcon,
  PillIcon,
  PizzaIcon,
  PlaneIcon,
  PlugIcon,
  ReceiptIcon,
  SandwichIcon,
  ScissorsIcon,
  ShieldIcon,
  ShirtIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SmartphoneIcon,
  SofaIcon,
  SparklesIcon,
  StethoscopeIcon,
  TagIcon,
  TicketIcon,
  TrainIcon,
  TreePalmIcon,
  TvIcon,
  UtensilsIcon,
  WifiIcon,
  WineIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Íconos de las categorías. En la web mostramos estos íconos de línea (blanco y negro,
// como el resto de la app); en WhatsApp no hay íconos, así que cada uno tiene su emoji
// "gemelo" que Chop usa en los mensajes. Al elegir un ícono se guardan los dos.

export const CATEGORY_ICONS = {
  utensils: { Icon: UtensilsIcon, emoji: "🍽️", label: "Cubiertos" },
  hamburger: { Icon: HamburgerIcon, emoji: "🍔", label: "Hamburguesa" },
  pizza: { Icon: PizzaIcon, emoji: "🍕", label: "Pizza" },
  sandwich: { Icon: SandwichIcon, emoji: "🥪", label: "Sándwich" },
  croissant: { Icon: CroissantIcon, emoji: "🥐", label: "Medialuna" },
  "ice-cream": { Icon: IceCreamConeIcon, emoji: "🍦", label: "Helado" },
  apple: { Icon: AppleIcon, emoji: "🍎", label: "Fruta" },
  coffee: { Icon: CoffeeIcon, emoji: "☕", label: "Café" },
  beer: { Icon: BeerIcon, emoji: "🍻", label: "Cerveza" },
  wine: { Icon: WineIcon, emoji: "🍷", label: "Vino" },
  cart: { Icon: ShoppingCartIcon, emoji: "🛒", label: "Changuito" },
  bag: { Icon: ShoppingBagIcon, emoji: "🛍️", label: "Bolsa de compras" },
  fuel: { Icon: FuelIcon, emoji: "⛽", label: "Surtidor" },
  car: { Icon: CarIcon, emoji: "🚗", label: "Auto" },
  taxi: { Icon: CarTaxiFrontIcon, emoji: "🚕", label: "Taxi" },
  bus: { Icon: BusIcon, emoji: "🚌", label: "Colectivo" },
  train: { Icon: TrainIcon, emoji: "🚆", label: "Tren" },
  bike: { Icon: BikeIcon, emoji: "🚲", label: "Bicicleta" },
  plane: { Icon: PlaneIcon, emoji: "✈️", label: "Avión" },
  palm: { Icon: TreePalmIcon, emoji: "🏝️", label: "Vacaciones" },
  house: { Icon: HouseIcon, emoji: "🏠", label: "Casa" },
  building: { Icon: Building2Icon, emoji: "🏢", label: "Edificio" },
  sofa: { Icon: SofaIcon, emoji: "🛋️", label: "Sillón" },
  wrench: { Icon: WrenchIcon, emoji: "🔧", label: "Herramienta" },
  lightbulb: { Icon: LightbulbIcon, emoji: "💡", label: "Lamparita" },
  plug: { Icon: PlugIcon, emoji: "🔌", label: "Enchufe" },
  flame: { Icon: FlameIcon, emoji: "🔥", label: "Gas" },
  droplet: { Icon: DropletIcon, emoji: "💧", label: "Agua" },
  wifi: { Icon: WifiIcon, emoji: "📶", label: "Internet" },
  phone: { Icon: SmartphoneIcon, emoji: "📱", label: "Celular" },
  laptop: { Icon: LaptopIcon, emoji: "💻", label: "Computadora" },
  tv: { Icon: TvIcon, emoji: "📺", label: "Televisión" },
  gamepad: { Icon: Gamepad2Icon, emoji: "🎮", label: "Juegos" },
  music: { Icon: MusicIcon, emoji: "🎵", label: "Música" },
  film: { Icon: ClapperboardIcon, emoji: "🎬", label: "Cine" },
  ticket: { Icon: TicketIcon, emoji: "🎟️", label: "Entradas" },
  pill: { Icon: PillIcon, emoji: "💊", label: "Remedios" },
  stethoscope: { Icon: StethoscopeIcon, emoji: "🩺", label: "Médico" },
  dumbbell: { Icon: DumbbellIcon, emoji: "🏋️", label: "Gimnasio" },
  scissors: { Icon: ScissorsIcon, emoji: "✂️", label: "Peluquería" },
  sparkles: { Icon: SparklesIcon, emoji: "✨", label: "Belleza" },
  shirt: { Icon: ShirtIcon, emoji: "👕", label: "Ropa" },
  baby: { Icon: BabyIcon, emoji: "👶", label: "Bebé" },
  paw: { Icon: PawPrintIcon, emoji: "🐾", label: "Mascotas" },
  flower: { Icon: Flower2Icon, emoji: "🌸", label: "Plantas" },
  graduation: { Icon: GraduationCapIcon, emoji: "🎓", label: "Estudios" },
  book: { Icon: BookOpenIcon, emoji: "📚", label: "Libros" },
  palette: { Icon: PaletteIcon, emoji: "🎨", label: "Arte" },
  gift: { Icon: GiftIcon, emoji: "🎁", label: "Regalos" },
  heart: { Icon: HeartIcon, emoji: "❤️", label: "Corazón" },
  briefcase: { Icon: BriefcaseIcon, emoji: "💼", label: "Trabajo" },
  landmark: { Icon: LandmarkIcon, emoji: "🏛️", label: "Impuestos" },
  shield: { Icon: ShieldIcon, emoji: "🛡️", label: "Seguros" },
  piggy: { Icon: PiggyBankIcon, emoji: "🐷", label: "Ahorro" },
  receipt: { Icon: ReceiptIcon, emoji: "🧾", label: "Factura" },
  cigarette: { Icon: CigaretteIcon, emoji: "🚬", label: "Cigarrillos" },
  package: { Icon: PackageIcon, emoji: "📦", label: "Caja" },
  tag: { Icon: TagIcon, emoji: "🏷️", label: "Etiqueta" },
} satisfies Record<string, { Icon: LucideIcon; emoji: string; label: string }>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS) as [CategoryIconKey, ...CategoryIconKey[]];

// Categorías viejas (creadas antes de los íconos) solo tienen emoji: buscamos el ícono gemelo.
// El "️" es un carácter invisible que algunos emojis traen y otros no: lo ignoramos.
const stripVariation = (s: string) => s.replace(/️/g, "");
const byEmoji = new Map(
  (Object.entries(CATEGORY_ICONS) as [CategoryIconKey, (typeof CATEGORY_ICONS)[CategoryIconKey]][]).map(([key, v]) => [
    stripVariation(v.emoji),
    key,
  ]),
);

/** El ícono de una categoría: el guardado, o el que corresponde a su emoji, o una etiqueta */
export function resolveCategoryIcon(icon: string | null | undefined, emoji?: string | null): CategoryIconKey {
  if (icon && icon in CATEGORY_ICONS) return icon as CategoryIconKey;
  return (emoji && byEmoji.get(stripVariation(emoji))) || "tag";
}

const sizes = {
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-8 rounded-lg", icon: "size-4" },
  lg: { box: "size-12 rounded-xl", icon: "size-6" },
};

/** Ícono de categoría dentro de un cuadradito con borde, en el color del texto */
export function CategoryIcon({
  icon,
  emoji,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  emoji?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { Icon } = CATEGORY_ICONS[resolveCategoryIcon(icon, emoji)];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center border bg-muted/40", sizes[size].box, className)}
    >
      <Icon className={sizes[size].icon} strokeWidth={1.75} />
    </span>
  );
}
