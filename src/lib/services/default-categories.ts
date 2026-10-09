import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CategoryInput } from "@/lib/validators";
import { CategoryError } from "@/lib/services/categories";

// Las categorías que recibe cada cuenta nueva (ensureDefaultCategories en categories.ts). Las
// edita el superadmin en Resumen; cambiarlas no toca las cuentas que ya existen.
// icon: ícono de la web (ver src/components/category-icon.tsx) · emoji: el que usa Chop en WhatsApp

export function listDefaultCategories() {
  return db.defaultCategory.findMany({ orderBy: { position: "asc" } });
}

const DUPLICATE = "Ya hay una categoría inicial con ese nombre";

export async function saveDefaultCategory(id: string | null, data: CategoryInput) {
  try {
    if (id) await db.defaultCategory.update({ where: { id }, data });
    else {
      const last = await db.defaultCategory.aggregate({ _max: { position: true } });
      await db.defaultCategory.create({ data: { ...data, position: (last._max.position ?? -1) + 1 } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new CategoryError(DUPLICATE);
    throw e;
  }
}

export async function deleteDefaultCategory(id: string) {
  // Chop necesita al menos una categoría para cargar gastos
  if ((await db.defaultCategory.count()) <= 1) throw new CategoryError("Tiene que quedar al menos una categoría inicial");
  await db.defaultCategory.deleteMany({ where: { id } });
}
