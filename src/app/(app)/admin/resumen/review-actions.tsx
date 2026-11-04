"use client";

import { useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { clearServerErrors, markReviewed } from "@/lib/actions/superadmin";
import { Button } from "@/components/ui/button";

/** Un mensaje que Chop no entendió: ya lo viste, se borra el texto */
export function ReviewedButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Marcar revisado"
      title="Revisado (se borra el texto)"
      disabled={pending}
      onClick={() => startTransition(() => markReviewed(id))}
    >
      <CheckIcon />
    </Button>
  );
}

export function ClearErrorsButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearServerErrors();
          toast.success("Errores borrados");
        })
      }
    >
      <CheckIcon />
      Todos revisados
    </Button>
  );
}
