"use client";

import Link from "next/link";
import { LogOutIcon, UserIcon } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// side="top": en la barra lateral de la compu el botón está abajo, así que el menú se abre para arriba
export function UserMenu({
  name,
  email,
  side = "bottom",
  className,
}: {
  name: string;
  email: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className={className} />}>
        <UserIcon />
        <span className="hidden truncate sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={side === "top" ? "start" : "end"} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/cuenta" />}>
          <UserIcon />
          Mi cuenta
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => logout()}>
          <LogOutIcon />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
