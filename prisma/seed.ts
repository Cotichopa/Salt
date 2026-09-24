// Carga los datos iniciales: categorías base y la cuenta de administrador.
// Se puede correr varias veces sin duplicar nada: `npx prisma db seed`
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { ensureDefaults } from "../src/lib/services/payment-sources";

// icon: ícono de la web (ver src/components/category-icon.tsx) · emoji: el que usa Chop en WhatsApp
const baseCategories = [
  { name: "Comida", icon: "utensils", emoji: "🍔", keywords: ["almuerzo", "cena", "desayuno", "delivery", "pizza", "rotiseria"] },
  { name: "Supermercado", icon: "cart", emoji: "🛒", keywords: ["super", "chino", "almacen", "verduleria", "carniceria"] },
  { name: "Salidas", icon: "beer", emoji: "🍻", keywords: ["salida", "bar", "boliche", "cine", "birra", "cumple"] },
  { name: "Nafta", icon: "fuel", emoji: "⛽", keywords: ["combustible", "gnc", "ypf", "shell", "axion"] },
  { name: "Transporte", icon: "taxi", emoji: "🚕", keywords: ["taxi", "uber", "cabify", "colectivo", "sube", "peaje", "estacionamiento"] },
  { name: "Servicios", icon: "lightbulb", emoji: "💡", keywords: ["luz", "gas", "agua", "internet", "celular", "expensas"] },
  { name: "Salud", icon: "pill", emoji: "💊", keywords: ["farmacia", "medico", "remedios", "prepaga", "dentista"] },
  { name: "Hogar", icon: "house", emoji: "🏠", keywords: ["alquiler", "ferreteria", "limpieza", "muebles"] },
  { name: "Ropa", icon: "shirt", emoji: "👕", keywords: ["zapatillas", "remera", "pantalon"] },
  { name: "Suscripciones", icon: "tv", emoji: "📺", keywords: ["netflix", "spotify", "disney", "youtube", "gimnasio"] },
  { name: "Otros", icon: "package", emoji: "📦", keywords: [] },
];

async function main() {
  for (const c of baseCategories) {
    // Las categorías base tienen userId = null
    const existing = await db.category.findFirst({ where: { userId: null, name: c.name } });
    if (existing) {
      await db.category.update({ where: { id: existing.id }, data: { emoji: c.emoji, icon: c.icon, keywords: c.keywords } });
    } else {
      await db.category.create({ data: c });
    }
  }
  console.log(`✔ ${baseCategories.length} categorías base`);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el .env");
  }
  // La contraseña nunca se guarda tal cual: se guarda un "hash" (una huella irreversible)
  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN" },
    create: {
      email,
      passwordHash,
      name: process.env.ADMIN_NAME || "Admin",
      phone: process.env.ADMIN_PHONE || null,
      role: "ADMIN",
    },
  });
  console.log(`✔ admin: ${email}`);

  // Tarjetas y billeteras base para las cuentas que todavía no tienen ninguna
  const users = await db.user.findMany({ select: { id: true } });
  for (const u of users) await ensureDefaults(u.id);
  console.log(`✔ medios de pago propios en ${users.length} cuenta(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
