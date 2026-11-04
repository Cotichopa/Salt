import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getViewedAccount, requireUser } from "@/lib/dal";
import { Card, CardContent } from "@/components/ui/card";
import { getNoticeSettings } from "@/lib/services/notices";
import { getPreferences } from "@/lib/services/preferences";
import { listPasskeys } from "@/lib/services/passkeys";
import { TIME_ZONE } from "@/lib/format";
import { PasswordRow } from "./change-password-form";
import { NoticesForm } from "./notices-form";
import { PasskeysSection } from "./passkeys-section";
import { PreferencesRows } from "./preferences-form";
import { ProfileRows } from "./profile-forms";

export const metadata: Metadata = { title: "Mi cuenta · Salt" };

// Cada tema con su título a la izquierda (en el celular, arriba) y sus filas a la derecha
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid items-start gap-3 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="py-1">
        <CardContent className="flex flex-col">{children}</CardContent>
      </Card>
    </section>
  );
}

export default async function AccountPage() {
  const user = await requireUser();
  // En "ver como" esta pantalla sería la del superadmin, pero no se puede cambiar nada
  const viewed = await getViewedAccount();
  if (viewed) {
    return (
      <div className="flex max-w-md flex-col gap-4 py-2">
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-muted-foreground">
          Estás viendo la cuenta de {viewed.name}. Para cambiar algo de la tuya, tocá «Salir» en la barra de arriba.
        </p>
      </div>
    );
  }
  const [notices, preferences, passkeys] = await Promise.all([
    getNoticeSettings(user.id),
    getPreferences(user.id),
    listPasskeys(user.id),
  ]);
  // Quién puede mirar los gastos de esta cuenta (decisión de Felipe: que todos lo sepan)
  const superadmins =
    user.role === "SUPERADMIN"
      ? []
      : await db.user.findMany({ where: { role: "SUPERADMIN", active: true }, select: { name: true } });
  const day = new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" });

  return (
    <div className="flex max-w-5xl flex-col gap-8 py-2">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>

      <Section title="Perfil" description="Cómo te conocen Salt y Chop.">
        <ProfileRows name={user.name} email={user.email} phone={user.phone} />
      </Section>

      <Section title="Cómo usás Salt" description="Se guarda solo apenas lo cambiás.">
        <PreferencesRows initial={preferences} />
      </Section>

      <Section title="Avisos de Chop" description="Te los cuenta la próxima vez que le escribas.">
        <NoticesForm initial={notices} />
      </Section>

      <Section title="Seguridad y privacidad" description="Cómo entrás y quién ve tus datos.">
        <PasswordRow />
        <div className="flex flex-col gap-2 border-t py-3">
          <div>
            <div className="text-xs text-muted-foreground">Entrar con huella</div>
            <div className="text-sm">Con la huella o la cara del celular, sin escribir la contraseña.</div>
          </div>
          <PasskeysSection
            passkeys={passkeys.map((p) => ({
              id: p.id,
              name: p.name,
              created: day.format(p.createdAt),
              lastUsed: p.lastUsedAt && day.format(p.lastUsedAt),
            }))}
          />
        </div>
        {superadmins.length > 0 && (
          <div className="border-t py-3">
            <div className="text-xs text-muted-foreground">Quién puede ver tus gastos</div>
            <p className="text-sm">
              {superadmins.map((s) => s.name).join(" y ")} {superadmins.length === 1 ? "administra Salt y puede" : "administran Salt y pueden"} ver
              tu cuenta: gastos, tickets, tarjetas, fijos y presupuestos. Solo mirar: no se puede cambiar nada. También ve los mensajes que Chop no
              entendió, para enseñarle frases nuevas (el resto de lo que le escribís no se guarda).
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
