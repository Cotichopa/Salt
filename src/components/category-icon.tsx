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
import {
  CATEGORY_ICON_INFO,
  CATEGORY_ICON_KEYS,
  resolveCategoryIcon,
  type CategoryIconKey,
} from "@/lib/category-icon-data";

// Los datos (clave, emoji y nombre) viven en src/lib/category-icon-data.ts; acá se re-exportan para
// que las pantallas sigan importando todo desde este archivo.
export { CATEGORY_ICON_KEYS, resolveCategoryIcon };
export type { CategoryIconKey };

// Íconos de las categorías. En la web mostramos estos íconos de línea (blanco y negro,
// como el resto de la app); en WhatsApp no hay íconos, así que cada uno tiene su emoji
// "gemelo" que Chop usa en los mensajes. Al elegir un ícono se guardan los dos.

// Los dibujos de cada ícono. `satisfies` obliga a que estén todos los de CATEGORY_ICON_INFO.
const ICON_COMPONENTS = {
  utensils: UtensilsIcon,
  hamburger: HamburgerIcon,
  pizza: PizzaIcon,
  sandwich: SandwichIcon,
  croissant: CroissantIcon,
  "ice-cream": IceCreamConeIcon,
  apple: AppleIcon,
  coffee: CoffeeIcon,
  beer: BeerIcon,
  wine: WineIcon,
  cart: ShoppingCartIcon,
  bag: ShoppingBagIcon,
  fuel: FuelIcon,
  car: CarIcon,
  taxi: CarTaxiFrontIcon,
  bus: BusIcon,
  train: TrainIcon,
  bike: BikeIcon,
  plane: PlaneIcon,
  palm: TreePalmIcon,
  house: HouseIcon,
  building: Building2Icon,
  sofa: SofaIcon,
  wrench: WrenchIcon,
  lightbulb: LightbulbIcon,
  plug: PlugIcon,
  flame: FlameIcon,
  droplet: DropletIcon,
  wifi: WifiIcon,
  phone: SmartphoneIcon,
  laptop: LaptopIcon,
  tv: TvIcon,
  gamepad: Gamepad2Icon,
  music: MusicIcon,
  film: ClapperboardIcon,
  ticket: TicketIcon,
  pill: PillIcon,
  stethoscope: StethoscopeIcon,
  dumbbell: DumbbellIcon,
  scissors: ScissorsIcon,
  sparkles: SparklesIcon,
  shirt: ShirtIcon,
  baby: BabyIcon,
  paw: PawPrintIcon,
  flower: Flower2Icon,
  graduation: GraduationCapIcon,
  book: BookOpenIcon,
  palette: PaletteIcon,
  gift: GiftIcon,
  heart: HeartIcon,
  briefcase: BriefcaseIcon,
  landmark: LandmarkIcon,
  shield: ShieldIcon,
  piggy: PiggyBankIcon,
  receipt: ReceiptIcon,
  cigarette: CigaretteIcon,
  package: PackageIcon,
  tag: TagIcon,
} satisfies Record<CategoryIconKey, LucideIcon>;

export const CATEGORY_ICONS = Object.fromEntries(
  CATEGORY_ICON_KEYS.map((key) => [key, { Icon: ICON_COMPONENTS[key], ...CATEGORY_ICON_INFO[key] }]),
) as { [K in CategoryIconKey]: { Icon: LucideIcon; emoji: string; label: string } };

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
