// Cuenta de demostración con un año de gastos, para ver cómo se ve Salt con muchos datos.
// Se corre con `npm run db:demo`. Cada vez borra la cuenta demo y la vuelve a crear con una
// contraseña nueva (se muestra en la terminal). No toca ninguna otra cuenta.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { isoToDate, todayISO, type CurrencyCode, type PaymentMethodCode } from "../src/lib/format";
import { createExpense } from "../src/lib/services/expenses";
import { ensureDefaultCategories } from "../src/lib/services/categories";
import { ensureDefaults } from "../src/lib/services/payment-sources";

const DEMO_EMAIL = "demo@salt.local";
const DAY = 86_400_000;

// Números "al azar" pero siempre los mismos (semilla fija): así cada demo sale igual
let seed = 20260924;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => min + random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const chance = (p: number) => random() < p;

// Medio de pago con su tarjeta o billetera (el efectivo no lleva)
type Pay = { method: PaymentMethodCode; source?: string };
const CARD = (name: string, method: "DEBIT" | "CREDIT" = "DEBIT"): Pay => ({ method, source: name });
const WALLET = (name = "Mercado Pago"): Pay => ({ method: "TRANSFER", source: name });
const CASH: Pay = { method: "CASH" };

async function main() {
  const today = todayISO();

  // 1) Borrar la demo anterior (los gastos, categorías, tarjetas y presupuestos se borran en cascada)
  const old = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (old) {
    await db.waSession.deleteMany({ where: { phone: `web:${old.id}` } });
    await db.user.delete({ where: { id: old.id } });
  }

  // 2) Crear la cuenta
  const password = randomBytes(6).toString("base64url");
  const user = await db.user.create({
    data: { name: "Demo", email: DEMO_EMAIL, passwordHash: await bcrypt.hash(password, 10), role: "MEMBER" },
  });
  await ensureDefaults(user.id);
  await ensureDefaultCategories(user.id);

  // 3) Categorías propias (además de las iniciales)
  await db.category.createMany({
    data: [
      { userId: user.id, name: "Café", icon: "coffee", emoji: "☕", keywords: ["cafe", "starbucks", "havanna", "medialunas"] },
      { userId: user.id, name: "Mascotas", icon: "paw", emoji: "🐾", keywords: ["veterinaria", "alimento", "toby"] },
      { userId: user.id, name: "Viajes", icon: "plane", emoji: "✈️", keywords: ["vuelo", "hotel", "airbnb"] },
    ],
  });
  const categories = await db.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  });
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const sources = await db.paymentSource.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
  const src = (name?: string) => (name ? sources.find((s) => s.name === name)!.id : null);

  // 4) Gastos día por día, del 1/10/2025 a hoy
  type Row = {
    userId: string;
    categoryId: string;
    amount: number;
    currency: CurrencyCode;
    paymentMethod: PaymentMethodCode;
    paymentSourceId: string | null;
    description: string | null;
    date: Date;
    source: "WEB" | "WHATSAPP";
  };
  const rows: Row[] = [];
  const start = "2025-10-01";
  let monthIndex = 0;
  let lastMonth = start.slice(0, 7);

  function add(date: string, category: string, amount: number, pay: Pay, description: string | null, opts: { usd?: boolean; fixed?: boolean } = {}) {
    rows.push({
      userId: user.id,
      categoryId: cat(category),
      // Inflación: los precios suben un 2,5 % por mes. Redondeamos a $100 (en dólares, sin redondear)
      amount: opts.usd ? Math.round(amount * 100) / 100 : Math.round((amount * 1.025 ** monthIndex) / 100) * 100,
      currency: opts.usd ? "USD" : "ARS",
      paymentMethod: pay.method,
      paymentSourceId: src(pay.source),
      description,
      date: isoToDate(date),
      // Los fijos se cargan desde la web; los del día a día, bastante por WhatsApp
      source: opts.fixed || chance(0.55) ? "WEB" : "WHATSAPP",
    });
  }

  for (let ms = Date.parse(`${start}T00:00:00Z`); ; ms += DAY) {
    const date = new Date(ms).toISOString().slice(0, 10);
    if (date > today) break;
    if (date.slice(0, 7) !== lastMonth) {
      lastMonth = date.slice(0, 7);
      monthIndex++;
    }
    const day = Number(date.slice(8, 10));
    const month = Number(date.slice(5, 7));
    const weekday = (new Date(ms).getUTCDay() + 6) % 7; // 0 = lunes ... 6 = domingo
    const winter = month >= 6 && month <= 8;

    // Fijos de todos los meses
    if (day === 1) add(date, "Hogar", 450000, WALLET(), "Alquiler", { fixed: true });
    if (day === 2) add(date, "Suscripciones", 35000, WALLET(), "Gimnasio", { fixed: true });
    if (day === 3) {
      add(date, "Suscripciones", 11999, CARD("Visa", "CREDIT"), "Netflix", { fixed: true });
      add(date, "Suscripciones", 4999, CARD("Visa", "CREDIT"), "Spotify", { fixed: true });
    }
    if (day === 5) add(date, "Salud", 118000, CARD("Visa"), "Prepaga", { fixed: true });
    if (day === 8) add(date, "Servicios", winter ? between(40000, 52000) : between(24000, 32000), CARD("Visa"), "Luz", { fixed: true });
    if (day === 10) add(date, "Servicios", winter ? between(32000, 45000) : between(11000, 16000), WALLET(), "Gas", { fixed: true });
    if (day === 12) add(date, "Servicios", 24000, CARD("Mastercard", "CREDIT"), "Internet", { fixed: true });
    if (day === 15) add(date, "Servicios", 16000, CARD("Mastercard", "CREDIT"), "Celular", { fixed: true });
    if (day === 18) add(date, "Suscripciones", 2.99, CARD("Visa", "CREDIT"), "iCloud", { usd: true, fixed: true });
    if (day === 20) add(date, "Mascotas", 42000, CARD("Cabal"), "Alimento de Toby", { fixed: true });

    // Día a día
    if (chance(0.28))
      add(date, "Supermercado", between(18000, 85000), pick([CARD("Visa"), CARD("Visa"), CARD("Cabal"), CARD("Mastercard", "CREDIT"), CASH]), pick(["Coto", "Carrefour", "Día", "Chino", "Jumbo", "Verdulería", "Carnicería"]));
    if (chance(weekday >= 4 ? 0.65 : 0.45))
      add(date, "Comida", between(6000, 28000), pick([CARD("Visa"), WALLET(), WALLET(), CASH, CARD("Naranja X", "CREDIT")]), pick(["Almuerzo", "Delivery", "Pizza", "Sushi", "Empanadas", "Hamburguesas", "Rotisería", null]));
    if (weekday < 5 && chance(0.45))
      add(date, "Café", between(2800, 6500), pick([CASH, WALLET(), CARD("Visa")]), pick(["Café", "Medialunas", "Starbucks", "Havanna", null]));
    if ((weekday === 4 || weekday === 5) && chance(0.6))
      add(date, "Salidas", between(15000, 70000), pick([CARD("Visa", "CREDIT"), CARD("Visa"), CASH, WALLET()]), pick(["Bar", "Cine", "Cumple", "Birras", "Boliche", "Cena con amigos"]));
    if (day === 6 || day === 16 || day === 26)
      add(date, "Nafta", between(35000, 65000), pick([CARD("Visa"), CARD("Mastercard", "CREDIT")]), pick(["YPF", "Shell", "Axion"]));
    if (chance(0.15)) add(date, "Transporte", between(3000, 14000), pick([WALLET(), CARD("Visa"), CASH, WALLET("Cuenta DNI")]), pick(["Uber", "Cabify", "SUBE", "Peaje", "Estacionamiento"]));
    if (chance(0.05)) add(date, "Salud", between(8000, 30000), pick([CARD("Visa"), WALLET("MODO")]), pick(["Farmacia", "Dentista", "Remedios"]));
    if (chance(0.04)) add(date, "Hogar", between(8000, 45000), pick([CARD("Visa"), CASH]), pick(["Ferretería", "Limpieza", "Bazar"]));
    if (chance(0.03)) add(date, "Ropa", between(20000, 90000), pick([CARD("Visa", "CREDIT"), CARD("Naranja X", "CREDIT")]), pick(["Remera", "Pantalón", "Medias"]));
    if (chance(0.03)) add(date, "Otros", between(5000, 40000), pick([CASH, WALLET()]), pick(["Regalo", "Librería", "Kiosco"]));
  }

  // Viaje a Brasil en marzo, en dólares
  add("2026-02-14", "Viajes", 650, CARD("Visa", "CREDIT"), "Vuelo a Florianópolis", { usd: true, fixed: true });
  add("2026-03-09", "Viajes", 480, CARD("Visa", "CREDIT"), "Hotel", { usd: true, fixed: true });
  for (const [date, amount] of [["2026-03-09", 34], ["2026-03-10", 52], ["2026-03-11", 41], ["2026-03-12", 58], ["2026-03-13", 27]] as const)
    add(date, "Comida", amount, CARD("Visa", "CREDIT"), "Comida en el viaje", { usd: true });

  await db.expense.createMany({ data: rows });

  // 5) Compras en cuotas: con el mismo servicio que la app, que arma una cuota por mes
  const cuotas = [
    { date: "2025-11-20", category: "Ropa", amount: 180000, installments: 6, card: "Visa", description: "Zapatillas" },
    { date: "2026-02-10", category: "Hogar", amount: 1200000, installments: 12, card: "Mastercard", description: "Heladera" },
    { date: "2026-07-05", category: "Ropa", amount: 240000, installments: 3, card: "Visa", description: "Campera" },
    { date: "2026-09-02", category: "Hogar", amount: 540000, installments: 6, card: "Naranja X", description: "Colchón" },
  ];
  for (const c of cuotas) {
    await createExpense(user.id, {
      categoryId: cat(c.category),
      amount: c.amount,
      currency: "ARS",
      paymentMethod: "CREDIT",
      paymentSourceId: src(c.card)!,
      installments: c.installments,
      description: c.description,
      date: c.date,
    });
  }

  // 6) Presupuestos armados sobre lo que va del mes: uno pasado, uno al límite y el resto bien
  const monthStart = isoToDate(`${today.slice(0, 7)}-01`);
  const spent = await db.expense.groupBy({
    by: ["categoryId"],
    where: { userId: user.id, currency: "ARS", date: { gte: monthStart } },
    _sum: { amount: true },
  });
  const spentIn = (name: string) => spent.find((s) => s.categoryId === cat(name))?._sum.amount?.toNumber() ?? 0;
  const round = (n: number) => Math.max(10000, Math.round(n / 10000) * 10000);
  const budgets = [
    { name: "Salidas", amount: round(spentIn("Salidas") * 0.85) }, // pasado
    { name: "Comida", amount: round(spentIn("Comida") / 0.88) }, // al límite (~88 %)
    { name: "Supermercado", amount: round(spentIn("Supermercado") / 0.55) },
    { name: "Café", amount: round(spentIn("Café") / 0.6) },
    { name: "Nafta", amount: round(spentIn("Nafta") / 0.45) },
  ];
  await db.budget.createMany({ data: budgets.map((b) => ({ userId: user.id, categoryId: cat(b.name), amount: b.amount })) });

  const total = await db.expense.count({ where: { userId: user.id } });
  console.log(`✔ Cuenta demo con ${total} gastos, 3 categorías propias y ${budgets.length} presupuestos`);
  console.log(`  Email:      ${DEMO_EMAIL}`);
  console.log(`  Contraseña: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
