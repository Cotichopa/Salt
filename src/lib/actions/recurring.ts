"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/dal";
import {
  createRecurring,
  deleteRecurring,
  loadDueRecurring,
  RecurringError,
  setRecurringActive,
  updateRecurring,
} from "@/lib/services/recurring";
import { recurringSchema, type FormState } from "@/lib/validators";

function revalidate() {
  revalidatePath("/fijos");
  // Al corregir el monto "desde este mes" también cambia un gasto
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/categorias", "layout");
  revalidatePath("/medios", "layout");
}

export async function saveRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireEditor();
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) await updateRecurring(user.id, id, parsed.data, parsed.data.from);
    else await createRecurring(user.id, parsed.data);
  } catch (e) {
    if (e instanceof RecurringError) return { message: e.message };
    throw e;
  }
  revalidate();
  return { ok: true, message: id ? "Gasto fijo actualizado" : `"${parsed.data.description}" agregado` };
}

/** Pausar o reanudar. Al reanudar, `loadPaused` carga los meses que estuvo pausado. */
export async function toggleRecurring(id: string, active: boolean, loadPaused = false): Promise<FormState> {
  const user = await requireEditor();
  let loaded = 0;
  try {
    await setRecurringActive(user.id, id, active === true, loadPaused === true);
    if (active && loadPaused) loaded = (await loadDueRecurring(user.id)).length;
  } catch (e) {
    if (e instanceof RecurringError) return { message: e.message };
    throw e;
  }
  revalidate();
  if (!active) return { ok: true, message: "Pausado: no se va a cargar hasta que lo reanudes" };
  return { ok: true, message: loaded > 0 ? `Reanudado: cargué ${loaded} ${loaded === 1 ? "gasto" : "gastos"}` : "Reanudado" };
}

export async function removeRecurring(id: string): Promise<FormState> {
  const user = await requireEditor();
  try {
    await deleteRecurring(user.id, id);
  } catch (e) {
    if (e instanceof RecurringError) return { message: e.message };
    throw e;
  }
  revalidate();
  return { ok: true, message: "Gasto fijo eliminado" };
}
