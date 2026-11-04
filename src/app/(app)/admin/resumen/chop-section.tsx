import { formatMonth } from "@/lib/format";
import { chopUsage, notUnderstood } from "@/lib/services/overview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Editable } from "@/components/read-only";
import { dateTime } from "./date-time";
import { MonthNav } from "./month-nav";
import { ReviewedButton } from "./review-actions";

// Pestaña Chop: primero lo pendiente (no depende del mes) y después los mensajes y el costo del mes

/** Los costos de la IA son de centavos de dólar: con 4 decimales ("US$ 0,0013") */
const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export async function ChopSection({ month, unclear }: { month: string; unclear: Awaited<ReturnType<typeof notUnderstood>> }) {
  const chop = await chopUsage(month);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Lo que no entendió</CardTitle>
          <CardDescription>Sirven para enseñarle frases nuevas. Al marcarlos revisados se borra el texto.</CardDescription>
        </CardHeader>
        <CardContent>
          {unclear.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendiente.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {unclear.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm break-words">«{m.text}»</p>
                    <p className="text-xs text-muted-foreground">
                      {m.user.name} · {m.source === "WHATSAPP" ? "WhatsApp" : "web"} · {m.kind} · {dateTime(m.createdAt)}
                    </p>
                  </div>
                  <Editable>
                    <ReviewedButton id={m.id} />
                  </Editable>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensajes y costo</CardTitle>
          <CardDescription>
            Mensajes de {formatMonth(month).toLowerCase()} (WhatsApp, chat de la web y tickets del formulario) y lo que costó la IA. Los que se
            resuelven sin IA son gratis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <MonthNav month={month} seccion="chop" />
          {chop.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie le escribió a Chop este mes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Mensajes</TableHead>
                  <TableHead className="text-right">Sin IA</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chop.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.messages}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {Math.round(((r.messages - r.withAi) / r.messages) * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.cost)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-medium tabular-nums">{usd(chop.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
