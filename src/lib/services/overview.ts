import "server-only";
import { execFile } from "node:child_process";
import { access, readdir, stat, statfs } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { isoToDate, monthRange, todayISO } from "@/lib/format";
import { listBudgets } from "@/lib/services/budgets";
import { getStatement, shiftMonth, statementToShow } from "@/lib/services/card-statements";
import { loginBlockedMinutes } from "@/lib/services/login-attempts";
import packageJson from "../../../package.json";

// Datos del Resumen del superadmin (/admin/resumen): cómo viene cada persona, la comparación por
// categoría, los accesos y el estado del servidor. Todo es de solo lectura, salvo noteWebUse.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Anota "usó la web ahora", como mucho una vez por hora (la condición va en la misma consulta) */
export async function noteWebUse(userId: string) {
  await db.user.updateMany({
    where: { id: userId, OR: [{ lastWebAt: null }, { lastWebAt: { lt: new Date(Date.now() - HOUR_MS) } }] },
    data: { lastWebAt: new Date() },
  });
}

const people = () =>
  db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, lastWebAt: true, lastChopAt: true },
  });

async function sumArs(userId: string, from: Date, to: Date) {
  const r = await db.expense.aggregate({ where: { userId, date: { gte: from, lt: to } }, _sum: { amountArs: true } });
  return r._sum.amountArs?.toNumber() ?? 0;
}

// ---------- Personas ----------

export type Alert = { level: "warning" | "serious"; text: string };

/** Lo que conviene mirar ahora: presupuestos pasados o por pasarse, y tarjetas que vencen sin pagar */
async function alertsFor(userId: string): Promise<Alert[]> {
  const today = todayISO();
  const alerts: Alert[] = [];
  for (const b of await listBudgets(userId)) {
    if (b.level === "exceeded") alerts.push({ level: "serious", text: `Se pasó del presupuesto de ${b.name}` });
    else if (b.level === "warning") alerts.push({ level: "warning", text: `Le queda poco del presupuesto de ${b.name}` });
  }
  const cards = await db.paymentSource.findMany({
    where: { userId, kind: "CARD", closingDay: { not: null }, dueDay: { not: null } },
    select: { id: true },
  });
  for (const card of cards) {
    const month = await statementToShow(userId, card.id);
    const s = month ? await getStatement(userId, card.id, month) : null;
    if (!s?.configured || s.expenses.length === 0) continue;
    const days = Math.round((isoToDate(s.due).getTime() - isoToDate(today).getTime()) / DAY_MS);
    if (s.status === "vencido") alerts.push({ level: "serious", text: `La ${s.card.name} venció y no está marcada pagada` });
    else if (s.status === "a pagar" && days <= 5) {
      const when = days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
      alerts.push({ level: "warning", text: `La ${s.card.name} vence ${when} sin pagar` });
    }
  }
  return alerts;
}

/**
 * Una fila por persona: lo gastado en el mes (en pesos), contra los mismos días del mes anterior
 * (como el Inicio), el último gasto cargado y las alertas de hoy.
 */
export async function peopleOverview(month: string) {
  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const { from, to } = monthRange(month);
  const prev = monthRange(shiftMonth(month, -1));
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : null;
  const prevTo = elapsed ? new Date(Math.min(prev.from.getTime() + elapsed * DAY_MS, prev.to.getTime())) : prev.to;

  return Promise.all(
    (await people()).map(async (u) => {
      const [total, previous, last, alerts] = await Promise.all([
        sumArs(u.id, from, to),
        sumArs(u.id, prev.from, prevTo),
        db.expense.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, source: true } }),
        u.active ? alertsFor(u.id) : Promise.resolve([]),
      ]);
      return { ...u, total, previous, lastExpense: last, alerts };
    }),
  );
}

// ---------- Comparar personas ----------

/**
 * Lo gastado por cada persona en cada categoría del mes. Cada cuenta tiene sus propias categorías,
 * así que se juntan por nombre ("Supermercado" de una y de otra). Las más grandes primero; después
 * de MAX_CATEGORIES, el resto va junto en "Otras".
 */
export async function compareByCategory(month: string, maxCategories = 8) {
  const { from, to } = monthRange(month);
  const users = (await people()).filter((u) => u.active);
  const rows = await db.expense.groupBy({
    by: ["userId", "categoryId"],
    where: { userId: { in: users.map((u) => u.id) }, date: { gte: from, lt: to } },
    _sum: { amountArs: true },
  });
  const names = new Map(
    (await db.category.findMany({ where: { id: { in: rows.map((r) => r.categoryId) } }, select: { id: true, name: true } })).map(
      (c) => [c.id, c.name],
    ),
  );

  const byName = new Map<string, Map<string, number>>(); // categoría → persona → total
  for (const r of rows) {
    const name = names.get(r.categoryId) ?? "Sin categoría";
    const perUser = byName.get(name) ?? new Map<string, number>();
    perUser.set(r.userId, (perUser.get(r.userId) ?? 0) + (r._sum.amountArs?.toNumber() ?? 0));
    byName.set(name, perUser);
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const sorted = [...byName.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));

  const top = sorted.slice(0, maxCategories);
  const rest = sorted.slice(maxCategories);
  if (rest.length > 0) {
    const others = new Map<string, number>();
    for (const [, perUser] of rest) for (const [id, v] of perUser) others.set(id, (others.get(id) ?? 0) + v);
    top.push([`Otras (${rest.length})`, others]);
  }

  // Solo las personas que gastaron algo en el mes (el orden, el de las cuentas: así el color de
  // cada una no cambia de un mes a otro mientras sean las mismas)
  const spenders = users.filter((u) => rows.some((r) => r.userId === u.id)).map((u) => ({ id: u.id, name: u.name }));
  return {
    people: spenders,
    categories: top.map(([name, perUser]) => ({
      name,
      values: spenders.map((p) => perUser.get(p.id) ?? 0),
    })),
  };
}

// ---------- Accesos ----------

export async function accessOverview() {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  return Promise.all(
    (await people()).map(async (u) => {
      const [passkeys, recentFails, blockedMinutes] = await Promise.all([
        db.passkey.count({ where: { userId: u.id } }),
        db.loginAttempt.count({ where: { email: u.email, createdAt: { gt: since } } }),
        loginBlockedMinutes(u.email),
      ]);
      return { ...u, passkeys, recentFails, blockedMinutes };
    }),
  );
}

// ---------- Estado del sistema ----------

export type Check = { label: string; ok: boolean | null; detail: string }; // null = no aplica / sin datos

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

/** La copia más nueva en ~/salt-backups/diario (scripts/backup-db.sh) */
async function lastBackup() {
  const dir = path.join(process.env.BACKUP_DIR || path.join(homedir(), "salt-backups"), "diario");
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".dump"));
    const stats = await Promise.all(files.map(async (f) => ({ f, s: await stat(path.join(dir, f)) })));
    stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
    return stats[0] ? { at: stats[0].s.mtime, size: stats[0].s.size, count: stats.length } : null;
  } catch {
    return null;
  }
}

// El token de WhatsApp se consulta a Meta como mucho una vez por hora
let tokenCache: { at: number; check: Check } | null = null;

async function whatsappTokenCheck(): Promise<Check> {
  const label = "Token de WhatsApp";
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { label, ok: null, detail: "No está configurado" };
  if (tokenCache && Date.now() - tokenCache.at < HOUR_MS) return tokenCache.check;
  let check: Check;
  try {
    const version = process.env.WHATSAPP_API_VERSION || "v25.0";
    const url = `https://graph.facebook.com/${version}/debug_token?input_token=${token}&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const { data } = (await res.json()) as { data?: { is_valid?: boolean; expires_at?: number } };
    if (!data?.is_valid) check = { label, ok: false, detail: "Venció o no es válido: Chop no puede contestar" };
    else if (!data.expires_at) check = { label, ok: true, detail: "Válido, permanente" };
    else check = { label, ok: true, detail: `Válido hasta el ${new Date(data.expires_at * 1000).toLocaleDateString("es-AR")}` };
  } catch {
    return { label, ok: null, detail: "No se pudo consultar a Meta" }; // no se guarda: se reintenta
  }
  tokenCache = { at: Date.now(), check };
  return check;
}

async function gitVersion() {
  try {
    const { stdout } = await promisify(execFile)("git", ["log", "-1", "--format=%h · %cs"], { timeout: 3000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString("es-AR", { maximumFractionDigits: 1 })} GB`;

export async function systemStatus() {
  const [backup, dbSize, disk, token, whisper, git] = await Promise.all([
    lastBackup(),
    db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    statfs(process.cwd()),
    whatsappTokenCheck(),
    Promise.all([process.env.WHISPER_CLI, process.env.WHISPER_MODEL].map((f) => (f ? exists(f) : false))),
    gitVersion(),
  ]);

  const backupAge = backup ? Date.now() - backup.at.getTime() : null;
  const free = disk.bavail * disk.bsize;
  const total = disk.blocks * disk.bsize;

  const checks: Check[] = [
    {
      label: "Último backup",
      // El timer corre cada noche: más de un día y medio sin copia es que algo falló
      ok: backupAge === null ? false : backupAge < 36 * HOUR_MS,
      detail: backup
        ? `${backup.at.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} · ${mb(backup.size)} · ${backup.count} copias diarias`
        : "No hay copias en esta compu",
    },
    token,
    {
      label: "Audios (Whisper)",
      ok: whisper.every(Boolean) ? true : process.env.WHISPER_CLI ? false : null,
      detail: whisper.every(Boolean)
        ? "Configurado"
        : process.env.WHISPER_CLI
          ? "Falta el programa o el modelo en la ruta del .env"
          : "No está configurado: Chop no escucha audios",
    },
    {
      label: "IA de Chop",
      ok: process.env.ANTHROPIC_API_KEY && process.env.AI_PARSER_ENABLED === "true" ? true : null,
      detail:
        process.env.ANTHROPIC_API_KEY && process.env.AI_PARSER_ENABLED === "true"
          ? "Activada"
          : "Desactivada: Chop entiende solo los mensajes simples",
    },
    {
      label: "Mails",
      ok: process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? true : null,
      detail: process.env.GMAIL_USER ? `Salen desde ${process.env.GMAIL_USER}` : "No configurados: no anda «olvidé mi contraseña»",
    },
    {
      label: "Disco",
      ok: free / total > 0.1, // menos del 10 % libre: aviso
      detail: `${gb(free)} libres de ${gb(total)}`,
    },
  ];

  return {
    checks,
    info: [
      { label: "Versión", detail: `${packageJson.version}${git ? ` (${git})` : ""}` },
      { label: "Base de datos", detail: mb(Number(dbSize[0].size)) },
      { label: "Funcionando desde", detail: new Date(Date.now() - process.uptime() * 1000).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) },
    ],
  };
}
