import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { accessOverview } from "@/lib/services/overview";
import { ago, formatPhone } from "@/lib/format";
import { AccountsView } from "./accounts-view";
import type { Account, InviteState } from "./account-fields";

export const metadata: Metadata = { title: "Cuentas · Salt" };

const roleLabels = { SUPERADMIN: "Superadmin", ADMIN: "Administrador", MEMBER: "Miembro" } as const;

/** "Web: hace 2 días · Chop: ayer" */
function lastUse(web: Date | null, chop: Date | null) {
  if (!web && !chop) return "Nunca entró";
  return `Web: ${ago(web)} · Chop: ${ago(chop)}`;
}

function loginProblem(access: { recentFails: number; blockedMinutes: number } | undefined) {
  if (access && access.blockedMinutes > 0) return { text: `Bloqueado (${access.blockedMinutes} min)`, serious: true };
  if (access && access.recentFails > 0) {
    return { text: `${access.recentFails} ${access.recentFails === 1 ? "contraseña mal" : "contraseñas mal"}`, serious: false };
  }
  return null;
}

function inviteState(invitation: { expiresAt: Date } | undefined): InviteState {
  if (!invitation) return "none";
  return invitation.expiresAt > new Date() ? "pending" : "expired";
}

function accessLine(active: boolean, invite: InviteState, passkeys: number) {
  if (!active) return "No puede entrar: cuenta desactivada";
  if (invite === "pending") return "Invitación enviada, todavía no eligió su contraseña";
  if (invite === "expired") return "La invitación venció sin que eligiera su contraseña";
  if (passkeys === 0) return "Con contraseña";
  return `Con contraseña y huella en ${passkeys} ${passkeys === 1 ? "dispositivo" : "dispositivos"}`;
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const admin = await requireAdmin();
  const isSuper = admin.role === "SUPERADMIN";
  // ?cuenta=<id>: llega con esa ficha abierta (desde "Para revisar", en el Resumen)
  const { cuenta } = await searchParams;
  const logins = new Map(isSuper ? (await accessOverview()).map((a) => [a.id, a]) : []);
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      active: true,
      lastWebAt: true,
      lastChopAt: true,
      // Una invitación sin usar: pedir otra o poner una contraseña anula las anteriores
      passwordResets: { where: { invite: true, usedAt: null }, select: { expiresAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { passkeys: true, expenses: true } },
    },
  });

  const accounts: Account[] = users.map((u) => {
    const isSelf = u.id === admin.id;
    const isTargetSuper = u.role === "SUPERADMIN";
    // La cuenta del superadmin solo la toca el superadmin (users.ts, canManage)
    const canManage = isSuper || !isTargetSuper;
    const invite = inviteState(u.passwordResets[0]);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      phoneLabel: u.phone ? formatPhone(u.phone) : null,
      role: u.role === "ADMIN" ? "ADMIN" : "MEMBER",
      roleLabel: roleLabels[u.role],
      active: u.active,
      invite,
      lastUse: lastUse(u.lastWebAt, u.lastChopAt),
      access: accessLine(u.active, invite, u._count.passkeys),
      login: loginProblem(logins.get(u.id)),
      expenses: isSuper ? u._count.expenses : 0,
      isSelf,
      canManage,
      canView: isSuper && !isSelf,
      canChangeRole: canManage && !isSelf && !isTargetSuper,
      canInvite: canManage && !isSelf && u.active,
      canWelcome: canManage && u.active && Boolean(u.phone),
      canToggle: canManage && !isSelf,
      canDelete: isSuper && !isSelf && !isTargetSuper,
      canUnlock: isSuper,
      canCloseSessions: isSuper && !isSelf,
    };
  });

  return <AccountsView accounts={accounts} initialId={typeof cuenta === "string" ? cuenta : null} />;
}
