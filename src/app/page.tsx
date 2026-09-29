import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getPreferences } from "@/lib/services/preferences";

// La portada no tiene contenido propio: manda a la pantalla que la persona eligió en "Cuenta"
// (Inicio, Gastos o Fijos). Sin sesión, el proxy ya la mandó a /login.
export default async function Home() {
  const user = await requireUser();
  redirect((await getPreferences(user.id)).homePage);
}
