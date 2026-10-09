import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";

// Data Access Layer: el único lugar donde se decide "quién es el usuario actual".
// Toda página o acción que maneje datos privados empieza llamando a estas funciones:
// - páginas que muestran gastos, tarjetas, etc.: requireAccount (la cuenta que se ve)
// - acciones que cambian algo: requireEditor o requireAdminEditor
// - lo que es de la persona logueada (Mi cuenta, Cuentas): requireUser o requireAdmin

const userFields = { id: true, name: true, email: true, phone: true, role: true, active: true } as const;

// Devuelve el usuario logueado o null. `cache` evita consultar la base
// varias veces durante la misma carga de página.
export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { ...userFields, sessionVersion: true },
  });
  // Si la cuenta se desactivó o borró, la sesión deja de valer aunque la cookie siga viva.
  // Igual si se cambió la contraseña después de entrar (la cookie trae la versión vieja).
  if (!user) return null;
  const { sessionVersion, ...current } = user;
  if (!current.active || sessionVersion !== session.ver) return null;
  return current;
});

export async function requireUser() {
  const user = await getCurrentUser();
  // Sin sesión el proxy ya habría mandado al login; si llegamos acá es porque la
  // cookie es válida pero la cuenta no, así que hay que borrar la cookie primero
  if (!user) redirect("/api/auth/logout");
  return user;
}

export const isAdminRole = (role: string) => role === "ADMIN" || role === "SUPERADMIN";

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/dashboard");
  return user;
}

// ---------- "Ver como" (solo el superadmin) ----------
// El superadmin elige una cuenta en Cuentas y recorre la app como esa persona, sin poder cambiar
// nada. A quién mira va en la cookie VIEW_AS_COOKIE (la pone y la saca /api/ver-como). La cookie
// sola no alcanza: cada vez se chequea en la base que quien la tiene sea SUPERADMIN.

export const VIEW_AS_COOKIE = "view-as";

/** La cuenta que el superadmin está mirando, o null si no está en "ver como" */
export const getViewedAccount = cache(async () => {
  const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!id) return null;
  const me = await getCurrentUser();
  if (!me || me.role !== "SUPERADMIN" || id === me.id) return null;
  return db.user.findUnique({ where: { id }, select: userFields });
});

/**
 * La cuenta cuyos datos muestra la página: la propia, o la que está mirando el superadmin
 * (`readOnly`: la página no tiene que cambiar nada, ni siquiera cargar los gastos fijos).
 */
export async function requireAccount() {
  const me = await requireUser();
  const viewed = await getViewedAccount();
  return viewed ? { ...viewed, readOnly: true } : { ...me, readOnly: false };
}

export class ReadOnlyError extends Error {
  constructor() {
    super("Estás viendo la cuenta de otra persona: solo se puede mirar. Salí de «ver como» para cambiar algo.");
  }
}

/** Para las acciones que cambian algo: la cuenta logueada, salvo en "ver como" (ahí se corta) */
export async function requireEditor() {
  const me = await requireUser();
  if (await getViewedAccount()) throw new ReadOnlyError();
  return me;
}

export async function requireAdminEditor() {
  const me = await requireAdmin();
  if (await getViewedAccount()) throw new ReadOnlyError();
  return me;
}

// ---------- Superadmin ----------

export async function requireSuperadmin() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN") redirect("/dashboard");
  return user;
}

export async function requireSuperadminEditor() {
  const me = await requireSuperadmin();
  if (await getViewedAccount()) throw new ReadOnlyError();
  return me;
}
