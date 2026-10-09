import { format } from "node:util";
import { db } from "@/lib/db";

// Errores del servidor en la base (tabla server_errors), para verlos en Resumen → Errores sin
// entrar a la VM con journalctl. Se engancha a console.error: todo lo que ya se escribía como error
// (Meta rechazó un mensaje, la IA falló...) se sigue escribiendo igual y además se guarda.

const KEEP_DAYS = 30;
const MAX_LENGTH = 2000;

// Robots que recorren internet probando fallas conocidas de Next.js: Next los rechaza y no
// son problemas de Salt
const NOISE = [/Server Reference ID did not match/, /failed-to-find-server-action/, /Failed to find Server Action/];

let saving = false; // si guardar falla y eso escribe otro error, no entrar en un bucle
let lastMessage = "";
let lastAt = 0;

async function save(message: string) {
  // El mismo error repetido en menos de un minuto se guarda una vez
  if (message === lastMessage && Date.now() - lastAt < 60_000) return;
  lastMessage = message;
  lastAt = Date.now();
  saving = true;
  try {
    await db.serverError.create({ data: { message } });
    // De paso, los de más de 30 días se van (como mucho, una vez cada tanto)
    if (Math.random() < 0.05) {
      await db.serverError.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
    }
  } catch {
    // sin base no hay dónde guardarlo: ya quedó en el log
  } finally {
    saving = false;
  }
}

export function captureServerErrors() {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    if (saving) return;
    const message = format(...args).slice(0, MAX_LENGTH);
    if (NOISE.some((re) => re.test(message))) return;
    void save(message);
  };
}

export function recentServerErrors(limit = 30) {
  return db.serverError.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export function countServerErrorsSince(since: Date) {
  return db.serverError.count({ where: { createdAt: { gte: since } } });
}
