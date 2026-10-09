"use client";

import { useTransition } from "react";
import { LockOpenIcon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { closeSessions, unlockLogin } from "@/lib/actions/superadmin";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function UnlockButton({ userId, name }: { userId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await unlockLogin(userId);
          toast.success(`${name} ya puede volver a entrar`);
        })
      }
    >
      <LockOpenIcon />
      Desbloquear
    </Button>
  );
}

export function CloseSessionsButton({ userId, name }: { userId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
        <LogOutIcon />
        Cerrar sesiones
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Sacar a {name} de todos sus dispositivos?</AlertDialogTitle>
          <AlertDialogDescription>
            Se cierran sus sesiones en la web y se quitan sus accesos con huella (por si perdió el celular). Vuelve a
            entrar con su contraseña, que no cambia. Chop por WhatsApp sigue andando.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                await closeSessions(userId);
                toast.success(`Listo: ${name} tiene que volver a entrar`);
              })
            }
          >
            Cerrar sesiones
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
