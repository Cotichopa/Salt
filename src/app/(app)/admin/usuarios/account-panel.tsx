"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { CircleAlertIcon, EyeIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { closeSessions, unlockLogin } from "@/lib/actions/superadmin";
import { deleteUser, inviteUser, resetUserPassword, toggleUserActive, updateUser, welcomeUser } from "@/lib/actions/users";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { useReadOnly } from "@/components/read-only";
import type { FormState } from "@/lib/validators";
import { MethodChoice, RoleChoice, type Account, type AccessMethod } from "./account-fields";

// La ficha de una cuenta: cada dato con su acción al lado. Las ventanas se arman recién al abrirlas,
// así vuelven a arrancar con los datos actuales.

type Open = { kind: "edit"; focus: "name" | "phone" | "role" } | { kind: "password" } | { kind: "deactivate" } | { kind: "closeSessions" } | { kind: "delete" } | null;

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
      {action}
    </div>
  );
}

function RowAction({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="link" size="sm" className="h-11 shrink-0 px-1 underline lg:h-7" {...props}>
      {children}
    </Button>
  );
}

export function AccountPanel({ account, avatar, onDeleted }: { account: Account; avatar: React.ReactNode; onDeleted: () => void }) {
  const readOnly = useReadOnly();
  const [open, setOpen] = useState<Open>(null);
  const [pending, startPending] = useTransition();
  const close = () => setOpen(null);
  const canEdit = account.canManage && !readOnly;
  const mayInvite = account.invite !== "none" && account.canInvite;

  function sendWelcome() {
    startPending(async () => {
      const result = await welcomeUser(account.id);
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.message ?? "No se pudo mandar");
    });
  }

  function toggle() {
    startPending(async () => {
      await toggleUserActive(account.id);
      toast.success(account.active ? `Cuenta de ${account.name} desactivada` : `Cuenta de ${account.name} activada`);
      close();
    });
  }

  function unlock() {
    startPending(async () => {
      await unlockLogin(account.id);
      toast.success(`${account.name} ya puede volver a entrar`);
    });
  }

  function endSessions() {
    startPending(async () => {
      await closeSessions(account.id);
      toast.success(`Listo: ${account.name} tiene que volver a entrar`);
      close();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {avatar}
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="truncate font-heading text-lg leading-snug font-semibold">{account.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{account.email}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button type="button" variant="outline" onClick={() => setOpen({ kind: "edit", focus: "name" })}>
              <PencilIcon />
              Editar
            </Button>
          )}
          {/* "Ver cuenta": el superadmin mira la cuenta de esa persona, sin poder cambiar nada */}
          {account.canView && (
            <form action="/api/ver-como" method="post">
              <input type="hidden" name="userId" value={account.id} />
              <Button type="submit" variant="outline">
                <EyeIcon />
                Ver cuenta
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <Row
          label="Rol"
          value={account.roleLabel}
          action={canEdit && account.canChangeRole && <RowAction onClick={() => setOpen({ kind: "edit", focus: "role" })}>Cambiar</RowAction>}
        />
        <Row
          label="WhatsApp"
          value={account.phoneLabel ?? "Sin cargar"}
          action={canEdit && <RowAction onClick={() => setOpen({ kind: "edit", focus: "phone" })}>{account.phone ? "Cambiar" : "Agregar"}</RowAction>}
        />
        <Row
          label="Cómo entra"
          value={account.access}
          action={canEdit && <RowAction onClick={() => setOpen({ kind: "password" })}>{mayInvite ? "Reenviar invitación" : "Cambiar"}</RowAction>}
        />
        <Row label="Último uso" value={account.lastUse} />
        {account.login && (
          <div className="flex items-center gap-3 border-t py-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">Login</div>
              <div
                className={
                  account.login.serious
                    ? "flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400"
                    : "flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400"
                }
              >
                {account.login.serious ? <CircleAlertIcon className="size-3.5 shrink-0" /> : <TriangleAlertIcon className="size-3.5 shrink-0" />}
                {account.login.text}
              </div>
            </div>
            {!readOnly && account.canUnlock && (
              <RowAction disabled={pending} onClick={unlock}>
                Desbloquear
              </RowAction>
            )}
          </div>
        )}
        {canEdit && account.canWelcome && (
          <Row
            label="Chop"
            value="Bienvenida por WhatsApp"
            action={
              <RowAction disabled={pending} onClick={sendWelcome}>
                Mandar
              </RowAction>
            }
          />
        )}
        {!readOnly && (account.canToggle || account.canCloseSessions || account.canDelete) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
            {account.canToggle && (
              <Button
                type="button"
                variant="ghost"
                className={account.active ? "-ml-2.5 h-11 text-destructive hover:text-destructive lg:h-8" : "-ml-2.5 h-11 lg:h-8"}
                disabled={pending}
                onClick={() => (account.active ? setOpen({ kind: "deactivate" }) : toggle())}
              >
                {account.active ? "Desactivar cuenta" : "Activar cuenta"}
              </Button>
            )}
            {account.canCloseSessions && (
              <Button type="button" variant="ghost" className="-ml-2.5 h-11 lg:h-8" onClick={() => setOpen({ kind: "closeSessions" })}>
                Cerrar sesiones
              </Button>
            )}
            {account.canDelete && (
              <Button
                type="button"
                variant="ghost"
                className="-ml-2.5 h-11 text-destructive hover:text-destructive lg:h-8"
                onClick={() => setOpen({ kind: "delete" })}
              >
                Borrar cuenta
              </Button>
            )}
          </div>
        )}
      </div>

      {open?.kind === "edit" && <EditDialog account={account} focus={open.focus} onClose={close} />}
      {open?.kind === "password" && <PasswordDialog account={account} onClose={close} />}
      {open?.kind === "deactivate" && (
        <AlertDialog open onOpenChange={(o) => !o && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Desactivar la cuenta de {account.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                No va a poder entrar a Salt ni usar a Chop. Sus gastos quedan guardados y la podés volver a activar cuando quieras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" variant="destructive" disabled={pending} onClick={toggle}>
                Desactivar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {open?.kind === "closeSessions" && (
        <AlertDialog open onOpenChange={(o) => !o && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Sacar a {account.name} de todos sus dispositivos?</AlertDialogTitle>
              <AlertDialogDescription>
                Se cierran sus sesiones en la web y se quitan sus accesos con huella (por si perdió el celular). Vuelve a entrar con su
                contraseña, que no cambia. Chop por WhatsApp sigue andando.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" variant="destructive" disabled={pending} onClick={endSessions}>
                Cerrar sesiones
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {open?.kind === "delete" && <DeleteDialog account={account} onClose={close} onDeleted={onDeleted} />}
    </div>
  );
}

function EditDialog({ account, focus, onClose }: { account: Account; focus: "name" | "phone" | "role"; onClose: () => void }) {
  const [state, action, saving] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await updateUser(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onClose();
    }
    return result;
  }, undefined);
  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Con onSubmit (y no action={...}) React no vacía el formulario si un dato vuelve con error
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto" initialFocus={focus === "phone" ? phoneRef : nameRef}>
        <DialogHeader>
          <DialogTitle>{account.isSelf ? "Tus datos" : `Datos de ${account.name}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={account.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input ref={nameRef} id="edit-name" name="name" defaultValue={account.name} required />
            <FieldError errors={state?.errors?.name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" name="email" type="email" defaultValue={account.email} required />
            <FieldError errors={state?.errors?.email} />
            <p className="text-xs text-muted-foreground">Es con el que entra a Salt.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-phone">WhatsApp</Label>
            <Input ref={phoneRef} id="edit-phone" name="phone" inputMode="tel" placeholder="5491122334455" defaultValue={account.phone ?? ""} />
            <FieldError errors={state?.errors?.phone} />
            <p className="text-xs text-muted-foreground">Vacío, Chop deja de reconocer a la persona por WhatsApp.</p>
          </div>
          {account.canChangeRole && <RoleChoice defaultValue={account.role} />}
          {state?.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [method, setMethod] = useState<AccessMethod>(account.canInvite ? "link" : "password");
  const [state, action, saving] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = method === "link" ? await inviteUser(account.id) : await resetUserPassword(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onClose();
    }
    return result;
  }, undefined);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account.isSelf ? "Tu contraseña" : `Contraseña de ${account.name}`}</DialogTitle>
          <DialogDescription>
            {account.isSelf
              ? "Al cambiarla se cierran tus otras sesiones y se borran tus huellas."
              : "Al cambiarla se cierran sus sesiones abiertas y se borran sus huellas."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={account.id} />
          {account.canInvite && (
            <MethodChoice
              value={method}
              onChange={setMethod}
              options={[
                { value: "link", title: "Mandarle un link por mail", text: "La elige la persona. El link vence en 48 horas." },
                { value: "password", title: "Ponerle una yo", text: "Se la pasás vos, y después la cambia en Mi cuenta." },
              ]}
            />
          )}
          {method === "password" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-account-password">Contraseña nueva</Label>
              <Input id="new-account-password" name="password" type="text" autoComplete="off" required autoFocus />
              <FieldError errors={state?.errors?.password} />
            </div>
          )}
          {state?.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {method === "link" ? "Mandar link" : "Cambiar contraseña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ account, onClose, onDeleted }: { account: Account; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [pending, startPending] = useTransition();
  const matches = typed.trim() === account.name;

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    startPending(async () => {
      const result = await deleteUser(account.id, typed);
      if (result?.ok) {
        toast.success(result.message);
        onDeleted();
      } else toast.error(result?.message ?? "No se pudo borrar");
    });
  }

  const expenses = account.expenses === 1 ? "su gasto" : account.expenses > 1 ? `sus ${account.expenses.toLocaleString("es-AR")} gastos` : null;

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar la cuenta de {account.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran para siempre {expenses ? `${expenses} y ` : ""}sus tarjetas, fijos, categorías, presupuestos y tickets. No se puede deshacer. Si
            solo querés que no entre, mejor desactivala.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={confirm} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirm">Escribí «{account.name}» para confirmar</Label>
            <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? "Borrando..." : "Borrar cuenta"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
