import { redirect } from "next/navigation";

// La portada no tiene contenido propio: el proxy manda a /login si no hay sesión
export default function Home() {
  redirect("/dashboard");
}
