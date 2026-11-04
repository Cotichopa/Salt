"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createUser, welcomeUser } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import type { CreatedAccount } from "@/lib/validators";
import { MethodChoice, RoleChoice, type AccessMethod } from "./account-fields";

// "Nueva cuenta": el formulario y, al crearla, una pantalla que cuenta qué pasó y ofrece la
// bienvenida de Chop. El contenido se arma cada vez que se abre, así arranca siempre vacío.

const METHODS = [
  { value: "link", title: "Le mandamos un mail", text: "Elige su contraseña con un link que vence en 48 horas." },
  { value: "password", title: "Le pongo una contraseña yo", text: "Se la pasás vos, y después la cambia en Mi cuenta." },
] as const;

export function CreateAccountDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Nueva cuenta
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <CreateAccount
          onCancel={() => setOpen(false)}
          onDone={(id) => {
            setOpen(false);
            onCreated(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateAccount({ onCancel, onDone }: { onCancel: () => void; onDone: (id: string) => void }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [method, setMethod] = useState<AccessMethod>("link");

  if (state?.created) return <Created account={state.created} onDone={() => onDone(state.created!.id)} />;

  // Con onSubmit (y no action={...}) React no vacía el formulario si un dato vuelve con error
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nueva cuenta</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-name">Nombre</Label>
            <Input id="new-name" name="name" required />
            <FieldError errors={state?.errors?.name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" name="email" type="email" required />
            <FieldError errors={state?.errors?.email} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-phone">WhatsApp (opcional)</Label>
          <Input id="new-phone" name="phone" inputMode="tel" placeholder="5491122334455" />
          <FieldError errors={state?.errors?.phone} />
          <p className="text-xs text-muted-foreground">Con este número Chop reconoce a la persona.</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm leading-none font-medium">¿Cómo va a entrar?</legend>
          <MethodChoice value={method} onChange={setMethod} options={[...METHODS]} />
          {method === "password" && (
            <div className="flex flex-col gap-2 pt-1">
              <Label htmlFor="new-password">Contraseña inicial</Label>
              <Input id="new-password" name="password" type="text" autoComplete="off" required autoFocus />
              <FieldError errors={state?.errors?.password} />
            </div>
          )}
        </fieldset>
        <RoleChoice />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando..." : method === "link" ? "Crear y mandar mail" : "Crear cuenta"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function Created({ account, onDone }: { account: CreatedAccount; onDone: () => void }) {
  const [sending, startSending] = useTransition();
  const [welcomed, setWelcomed] = useState(false);

  function sendWelcome() {
    startSending(async () => {
      const result = await welcomeUser(account.id);
      if (result?.ok) {
        toast.success(result.message);
        setWelcomed(true);
      } else toast.error(result?.message ?? "No se pudo mandar");
    });
  }

  return (
    <>
      <DialogHeader>
        <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
          <CheckIcon className="size-5" />
        </span>
        <DialogTitle>La cuenta de {account.name} está lista</DialogTitle>
        <DialogDescription>
          {!account.invited && "Pasale la contraseña que elegiste. Después la puede cambiar en Mi cuenta."}
          {account.invited && !account.mailError && `Le mandamos un mail a ${account.email} para que elija su contraseña. El link vence en 48 horas.`}
        </DialogDescription>
      </DialogHeader>
      {account.mailError && (
        <p className="text-sm text-destructive">
          No se pudo mandar el mail: {account.mailError} Lo podés reenviar desde su ficha, con «Reenviar invitación».
        </p>
      )}
      {account.phone && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div>
            <p className="font-medium">¿Le mandamos la bienvenida de Chop?</p>
            <p className="text-muted-foreground">Le llega por WhatsApp al número que cargaste. También la podés mandar después.</p>
          </div>
          {welcomed ? (
            <p className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
              <CheckIcon className="size-4" />
              Bienvenida enviada
            </p>
          ) : (
            <Button type="button" className="self-start" disabled={sending} onClick={sendWelcome}>
              {sending ? "Mandando..." : "Mandar bienvenida"}
            </Button>
          )}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Listo
        </Button>
      </DialogFooter>
    </>
  );
}
