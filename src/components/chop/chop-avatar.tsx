import Image from "next/image";
import { cn } from "@/lib/utils";

// Cara de Chop, el beagle inglés que atiende en Salt (public/chop.png), en grises como el resto de la app.
// Va siempre sobre un círculo blanco, también en modo oscuro: el dibujo tiene contorno
// oscuro y sobre fondo negro se perdería.

const sizes = {
  sm: "size-10", // encabezado del chat
  md: "size-12", // saludo del inicio
  lg: "size-14", // botón flotante
};

export function ChopAvatar({ size = "md", className }: { size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white",
        sizes[size],
        className,
      )}
    >
      <Image src="/chop.png" alt="" width={256} height={256} className="size-[76%]" priority={size === "lg"} />
    </span>
  );
}
