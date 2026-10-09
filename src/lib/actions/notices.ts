"use server";

import { z } from "zod";
import { requireEditor } from "@/lib/dal";
import { setNoticeSetting } from "@/lib/services/notices";

const schema = z.object({
  setting: z.enum(["notifyCardDue", "notifyWeekly", "notifyMonthly"]),
  on: z.boolean(),
});

/** Prende o apaga un aviso de Chop (desde "Cuenta"). Cada tilde se guarda apenas se toca. */
export async function updateNoticeSetting(input: z.infer<typeof schema>) {
  const user = await requireEditor();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };
  await setNoticeSetting(user.id, parsed.data.setting, parsed.data.on);
  return { ok: true };
}
