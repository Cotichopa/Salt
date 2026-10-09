import "server-only";
import { db } from "@/lib/db";
import { dateToISO, isoToDate, todayISO } from "@/lib/format";
import { parseTag } from "@/lib/tags";

// Etiquetas de cada cuenta (tabla tags) y a qué gastos van. Como el resto de los servicios, todo
// recibe el userId y filtra por él. Las reglas de cómo se escriben están en src/lib/tags.ts.

export class TagError extends Error {}

/** Los ids de esas etiquetas (por nombre), creando las que no existen. Los nombres inválidos se ignoran. */
export async function ensureTags(userId: string, names: string[]) {
  const ids: string[] = [];
  for (const raw of names) {
    const tag = parseTag(raw);
    if (!tag) continue;
    // upsert: si dos pedidos la crean a la vez, no se duplica (userId + key es único)
    const row = await db.tag.upsert({
      where: { userId_key: { userId, key: tag.key } },
      create: { userId, name: tag.name, key: tag.key },
      update: {},
      select: { id: true },
    });
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return ids;
}

/**
 * Deja esos gastos con exactamente esas etiquetas (las que tenían y no están, se sacan). Los gastos
 * tienen que ser de la persona: se filtran por userId.
 */
export async function setExpenseTags(userId: string, expenseIds: string[], names: string[]) {
  const tagIds = await ensureTags(userId, names);
  const mine = await db.expense.findMany({ where: { id: { in: expenseIds }, userId }, select: { id: true } });
  await db.$transaction(
    mine.map((e) =>
      db.expense.update({ where: { id: e.id }, data: { tags: { set: tagIds.map((id) => ({ id })) } }, select: { id: true } }),
    ),
  );
}

export type TagSummary = { id: string; name: string; count: number; total: number; lastDate: string | null };

/**
 * Todas las etiquetas con cuántos gastos tienen, cuánto suman (en pesos, cuotas por venir incluidas: es lo
 * que costó) y la fecha del último; las usadas más recientemente primero.
 */
export async function listTags(userId: string): Promise<TagSummary[]> {
  const today = isoToDate(todayISO());
  const tags = await db.tag.findMany({
    where: { userId },
    select: { id: true, name: true, expenses: { select: { amountArs: true, date: true } } },
  });
  return tags
    .map((t) => {
      // El último gasto que ya pasó (no una cuota de los meses que vienen)
      const last = t.expenses.reduce<Date | null>((max, e) => (e.date <= today && (!max || e.date > max) ? e.date : max), null);
      return {
        id: t.id,
        name: t.name,
        count: t.expenses.length,
        // Los gastos viejos en USD sin convertir no tienen valor en pesos: no suman
        total: t.expenses.reduce((sum, e) => sum + (e.amountArs?.toNumber() ?? 0), 0),
        lastDate: last ? dateToISO(last) : null,
      };
    })
    .sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.name.localeCompare(b.name));
}

/** Solo los nombres, de la A a la Z (para sugerirlas en el formulario de gasto) */
export async function listTagNames(userId: string) {
  const tags = await db.tag.findMany({ where: { userId }, select: { name: true }, orderBy: { name: "asc" } });
  return tags.map((t) => t.name);
}

/** Una etiqueta de la persona, o null */
export async function getTag(userId: string, id: string) {
  return db.tag.findFirst({ where: { id, userId }, select: { id: true, name: true } });
}

/** Cambia el nombre ("bariloche" → "Bariloche2026"). Si ya hay otra con ese nombre, avisa. */
export async function renameTag(userId: string, id: string, newName: string) {
  const tag = parseTag(newName);
  if (!tag) throw new TagError("Una etiqueta es una sola palabra (letras, números, _ o -), de hasta 30.");
  const other = await db.tag.findFirst({ where: { userId, key: tag.key, NOT: { id } }, select: { id: true } });
  if (other) throw new TagError(`Ya tenés la etiqueta #${tag.name}.`);
  const { count } = await db.tag.updateMany({ where: { id, userId }, data: { name: tag.name, key: tag.key } });
  if (count === 0) throw new TagError("Etiqueta no encontrada");
}

/** Borra la etiqueta: sus gastos quedan, sin ella */
export async function deleteTag(userId: string, id: string) {
  const { count } = await db.tag.deleteMany({ where: { id, userId } });
  if (count === 0) throw new TagError("Etiqueta no encontrada");
}
