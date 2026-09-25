// Carga los datos iniciales: la cuenta de administrador y sus categorías y medios de pago.
// Se puede correr varias veces sin duplicar nada: `npx prisma db seed`
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { ensureDefaultCategories } from "../src/lib/services/categories";
import { ensureDefaults } from "../src/lib/services/payment-sources";

async function main() {
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

  // Categorías, tarjetas y billeteras iniciales para las cuentas que todavía no tienen
  const users = await db.user.findMany({ select: { id: true } });
  for (const u of users) {
    await ensureDefaultCategories(u.id);
    await ensureDefaults(u.id);
  }
  console.log(`✔ categorías y medios de pago iniciales en ${users.length} cuenta(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
