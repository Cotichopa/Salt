import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { ago, formatPhone } from "@/lib/format";
import { AccountsView } from "./accounts-view";
import type { Account, InviteState } from "./account-fields";

export const metadata: Metadata = { title: "Cuentas · Salt" };

const roleLabels = { SUPERADMIN: "Superadmin", ADMIN: "Administrador", MEMBER: "Miembro" } as const;

/** "Hace 2 días, por la web": lo último que usó, entre la web y Chop */
function lastUse(web: Date | null, chop: Date | null) {
  if (!web && !chop) return "Nunca entró";
  const byChop = !web || (chop !== null && chop > web);
  const text = `${ago(byChop ? chop : web)}, ${byChop ? "por Chop" : "por la web"}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
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

export default async function UsersPage() {
  const admin = await requireAdmin();
  const isSuper = admin.role === "SUPERADMIN";
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
      expenses: isSuper ? u._count.expenses : 0,
      isSelf,
      canManage,
      canView: isSuper && !isSelf,
      canChangeRole: canManage && !isSelf && !isTargetSuper,
      canInvite: canManage && !isSelf && u.active,
      canWelcome: canManage && u.active && Boolean(u.phone),
      canToggle: canManage && !isSelf,
      canDelete: isSuper && !isSelf && !isTargetSuper,
    };
  });

  return <AccountsView accounts={accounts} />;
}
