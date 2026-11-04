"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Editable } from "@/components/read-only";
import { AccountPanel } from "./account-panel";
import { CreateAccountDialog } from "./create-account-dialog";
import type { Account } from "./account-fields";

// La pantalla de Cuentas: la lista de personas y la ficha de la elegida. En la compu la ficha va al
// lado (desde lg:, cuando aparece el menú lateral); en el celular y la tablet sube desde abajo.

const NARROW = "(max-width: 1023px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const useIsNarrow = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );

function Avatar({ account, large }: { account: Account; large?: boolean }) {
  const initials = account.name.trim().slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        large ? "size-12 text-sm" : "size-9",
        account.active ? "bg-muted" : "text-muted-foreground",
      )}
    >
      {initials}
    </span>
  );
}

function subtitle(account: Account) {
  if (account.login) return account.login.text;
  if (!account.active) return "Desactivada";
  if (account.invite === "pending") return "Invitación pendiente";
  if (account.invite === "expired") return "Invitación vencida";
  return account.roleLabel;
}

export function AccountsView({ accounts, initialId }: { accounts: Account[]; initialId: string | null }) {
  const [selectedId, setSelectedId] = useState(initialId);
  const isNarrow = useIsNarrow();

  const chosen = accounts.find((a) => a.id === selectedId) ?? null;
  // En la compu siempre hay una ficha a la vista; en el celular, recién al tocar a alguien
  const shown = chosen ?? accounts[0];
  const inactive = accounts.filter((a) => !a.active).length;

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}
            {inactive > 0 && `, ${inactive} ${inactive === 1 ? "desactivada" : "desactivadas"}`}
          </p>
        </div>
        <Editable>
          <CreateAccountDialog onCreated={(id) => !isNarrow && setSelectedId(id)} />
        </Editable>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="p-1.5">
          <ul className="flex flex-col gap-0.5">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-current={a.id === shown?.id && !isNarrow ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50",
                    a.id === shown?.id && "lg:bg-muted lg:hover:bg-muted",
                  )}
                >
                  <Avatar account={a} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-semibold", !a.active && "text-muted-foreground")}>
                      {a.name}
                      {a.isSelf && <span className="font-normal text-muted-foreground"> (vos)</span>}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{subtitle(a)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {shown && (
          <Card className="hidden lg:block">
            <CardContent>
              <AccountPanel key={shown.id} account={shown} avatar={<Avatar account={shown} large />} onDeleted={() => setSelectedId(null)} />
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={isNarrow && chosen !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="bottom" className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-6">
          {chosen && (
            <>
              <SheetHeader className="sr-only p-0">
                <SheetTitle>{chosen.name}</SheetTitle>
              </SheetHeader>
              <AccountPanel key={chosen.id} account={chosen} avatar={<Avatar account={chosen} large />} onDeleted={() => setSelectedId(null)} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
