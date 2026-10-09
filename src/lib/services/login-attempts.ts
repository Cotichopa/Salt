import "server-only";
import { db } from "@/lib/db";

// Límite de intentos en el login: si un email junta MAX_FAILS contraseñas mal en WINDOW_MS, queda
// bloqueado hasta que el más viejo de esos intentos salga de la ventana (como mucho, 15 minutos).
// Mientras está bloqueado no se prueba la contraseña ni quedan intentos nuevos anotados: así la
// persona de verdad puede volver a entrar a los 15 minutos aunque alguien siga probando. Entrar bien
// o cambiar la contraseña con el link del mail borra los intentos.
//
// El intento se anota ANTES de probar la contraseña (claimLoginAttempt). Si primero se preguntara
// "¿está bloqueado?" y se anotara después, 100 pedidos mandados al mismo tiempo pasarían todos la
// pregunta antes de que se anotara el primero: 100 contraseñas probadas en vez de 5.

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

/**
 * Anota el intento y dice si se puede probar la contraseña: 0 = adelante (si sale mal, el intento
 * queda anotado; si sale bien, clearFailedLogins lo borra), o los minutos que faltan si está bloqueado.
 * Cada pedido cuenta su propio intento más todos los anotados antes, así que aunque lleguen muchos
 * juntos, solo MAX_FAILS pasan.
 */
export async function claimLoginAttempt(email: string) {
  const [attempt] = await db.$transaction([
    db.loginAttempt.create({ data: { email }, select: { id: true } }),
    // de paso, limpia los intentos viejos de todos
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } }),
  ]);
  const fails = await db.loginAttempt.count({
    where: { email, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
  });
  if (fails <= MAX_FAILS) return 0;
  // Bloqueado: este intento no cuenta (si contara, alguien que siga probando alargaría el bloqueo)
  await db.loginAttempt.delete({ where: { id: attempt.id } });
  return Math.max(1, await loginBlockedMinutes(email));
}

/** Borra los intentos de un email (al entrar bien) */
export async function clearFailedLogins(email: string) {
  await db.loginAttempt.deleteMany({ where: { email } });
}
