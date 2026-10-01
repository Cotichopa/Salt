import "server-only";
import { db } from "@/lib/db";

// Límite de intentos en el login: si un email junta MAX_FAILS contraseñas mal en WINDOW_MS, queda
// bloqueado hasta que el más viejo de esos intentos salga de la ventana (como mucho, 15 minutos).
// Mientras está bloqueado no se prueba la contraseña ni se anotan intentos nuevos: así la persona
// de verdad puede volver a entrar a los 15 minutos aunque alguien siga probando. Entrar bien o
// cambiar la contraseña con el link del mail borra los intentos.

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const KEEP_MS = 24 * 60 * 60 * 1000; // los intentos de más de un día ya no sirven: se borran

/** Minutos que faltan para poder volver a probar, o 0 si el email no está bloqueado */
export async function loginBlockedMinutes(email: string) {
  const fails = await db.loginAttempt.findMany({
    where: { email, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    take: MAX_FAILS,
    select: { createdAt: true },
  });
  if (fails.length < MAX_FAILS) return 0;
  const unblockAt = fails[MAX_FAILS - 1].createdAt.getTime() + WINDOW_MS;
  return Math.max(1, Math.ceil((unblockAt - Date.now()) / 60_000));
}

/** Anota una contraseña mal (y de paso limpia los intentos viejos de todos) */
export async function recordFailedLogin(email: string) {
  await db.$transaction([
    db.loginAttempt.create({ data: { email } }),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } }),
  ]);
}

/** Borra los intentos de un email (al entrar bien) */
export async function clearFailedLogins(email: string) {
  await db.loginAttempt.deleteMany({ where: { email } });
}
