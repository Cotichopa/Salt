// Da (o saca) el rol SUPERADMIN: ver las cuentas de los demás desde Cuentas → «Ver cuenta».
// No hay botón en la web a propósito: solo lo puede dar quien tiene acceso al servidor.
//   npm run superadmin -- <email>          → pasa a SUPERADMIN
//   npm run superadmin -- <email> --quitar → vuelve a ADMIN
import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) {
    console.error("Uso: npm run superadmin -- <email> [--quitar]");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`No hay ninguna cuenta con el email ${email}`);
    process.exit(1);
  }
  const role = flag === "--quitar" ? "ADMIN" : "SUPERADMIN";
  await db.user.update({ where: { id: user.id }, data: { role } });
  console.log(`${user.name} (${user.email}) ahora es ${role}.`);
}

main().finally(() => db.$disconnect());
