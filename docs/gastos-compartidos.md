# Gastos compartidos y total de la casa (pendiente)

Pedido de Felipe (2026-10-09): la próxima función grande de Salt. **Cambia una decisión anterior**: hasta
ahora cada cuenta iba separada, sin total de la casa ni gastos compartidos (ver "Rumbo a la v1" en
`docs/estado.md`). Para retomarlo: leer este archivo, responder las preguntas de abajo y recién ahí codear.

Son dos cosas relacionadas pero distintas:

- **Total de la casa**: ver cuánto gasta la familia junta (por mes, por categoría, por persona), sumando
  las cuentas de los que forman parte de la casa.
- **Gastos compartidos**: un gasto que pagó uno pero es de varios (el súper, la luz, una cena) y se
  reparte: a cada uno le cuenta su parte, y queda anotado quién le debe a quién.

## Cómo está hecho hoy

- **Todo es por cuenta**: cada servicio recibe el `userId` y filtra por él ("regla de oro" en
  `src/lib/services/expenses.ts`). Gastos, categorías, tarjetas y billeteras, presupuestos, fijos,
  etiquetas, comercios, tickets y avisos son de una sola persona (`prisma/schema.prisma`, modelo `User`).
- **Las categorías son de cada cuenta** (se copian las iniciales al crearla): dos personas pueden tener
  "Supermercado" con ids distintos, o nombres distintos para lo mismo.
- **Lo único que mira varias cuentas** es el panel del superadmin (`src/lib/services/overview.ts`):
  `peopleOverview` (lo gastado por cada persona) y `compareByCategory` (junta las categorías **por nombre**).
  Es solo para el superadmin y solo mirar.
- **Chop** identifica a la persona por su número de WhatsApp (`users.phone`) y trabaja solo con su cuenta.
- **Tarjetas**: el resumen de cada tarjeta suma los gastos con crédito de esa tarjeta (de su dueño). Si un
  gasto compartido se pagó con la Visa de Felipe, el banco le cobra el total a Felipe.

## Preguntas para decidir antes de empezar

### La casa
1. ¿Una sola casa para toda la familia, o puede haber varias (por ejemplo, Felipe con su pareja y sus
   papás aparte)?
   a) Una sola, con todas las cuentas que se sumen. **(más simple)**
   b) Varias casas; cada cuenta puede estar en una o en más de una.
2. ¿Quién arma la casa y suma gente?
   a) El admin/superadmin desde Cuentas.
   b) Cualquiera invita a otro (y el otro acepta).
3. ¿Qué ve cada miembro de los gastos de los demás?
   a) Solo totales de la casa (por mes, por categoría y por persona), **sin el detalle** de cada gasto
      ajeno. **(respeta la privacidad que hay hoy)**
   b) Todo el detalle de todos.
   c) Solo los gastos marcados como compartidos; lo demás sigue privado.
4. Las categorías de la casa: como hoy son de cada cuenta,
   a) se juntan por nombre, como hace el panel del superadmin (`compareByCategory`). **(no cambia nada de lo
      que ya existe)**
   b) la casa tiene sus propias categorías, comunes a todos.

### Los gastos compartidos
5. ¿Qué quiere decir "compartido"?
   a) **Se reparte**: a cada uno le cuenta su parte en sus totales y presupuestos, y el que pagó queda con
      "te deben". **(lo más útil)**
   b) Solo se marca "de la casa" (suma en el total de la casa) sin repartir ni deudas.
6. ¿Cómo se reparte?
   a) En partes iguales entre los que se eligen, con opción de poner montos o porcentajes a mano.
   b) Siempre en partes iguales.
7. ¿Se lleva la cuenta de quién le debe a quién (como Splitwise), con un botón para **saldar**?
   a) Sí: saldo entre cada par de personas y "Saldar" (registra el pago, que no es un gasto).
   b) No por ahora.
8. ¿En qué categoría le cae la parte a cada uno?
   a) En la categoría con el mismo nombre en su cuenta (si no la tiene, se crea o va a "Otros").
   b) La elige cada uno.
9. ¿Quién puede editar o borrar un gasto compartido?
   a) Solo el que lo cargó; a los demás les llega el cambio. **(recomendado)**
   b) Cualquiera de los que lo comparten.
10. ¿El otro se entera cuando le cargan un gasto compartido?
    a) Sí: Chop se lo cuenta la próxima vez que le escriba (como los avisos de hoy) y, cuando estén, por
       notificación push.
    b) No, lo ve en la app.

### El resto
11. Tarjetas: el gasto compartido pagado con crédito va **completo** al resumen de la tarjeta del que pagó
    (es lo que cobra el banco), y a los demás solo les cuenta su parte. ¿Está bien?
12. Cuotas y dólares: ¿se reparte cada cuota (y cada uno ve su parte de cada cuota) y en USD igual que en
    pesos? (Lo natural es que sí.)
13. Presupuestos de la casa (por ejemplo, "Supermercado de la casa: $800.000"):
    a) Sí, además de los de cada uno.
    b) Más adelante.
14. Chop: "super 30000 a medias con papá", "luz 45000 compartido con todos", "¿cuánto gastó la casa este
    mes?", "¿cuánto le debo a papá?". ¿Todo eso, o solo una parte para empezar?
15. ¿Va antes o después de lo que quedó del plan del 2026-10-09 (atajos de teclado, notificaciones push y
    avisos a la familia)? Ojo: los avisos (etapa 7, push) le sirven a esta función.

## Idea de cómo hacerlo (a confirmar con las respuestas)

Datos (nombres tentativos):
- `households` (la casa) y `household_members` (cuenta + casa, con quién la administra).
- `expense_shares`: para un gasto compartido, una fila por persona con su parte (monto, en pesos y en
  dólares como los gastos) y la categoría en su cuenta. El gasto original sigue siendo del que pagó.
- `settlements`: los pagos para saldar deudas ("Juan le pagó $15.000 a Felipe").

Lo que más cambia:
- Las sumas de cada persona (Inicio mes y año, categorías, presupuestos, resumen de Chop) pasan a contar
  **su parte** de los compartidos: hoy suman `expenses` del `userId`; habría que sumar también sus
  `expense_shares` (y no el total de los que pagó para otros). Es el cambio más delicado: tocar
  `stats.ts`, `category-stats.ts`, `budgets.ts`, `overview.ts` y `menu.ts` (`sendSummary`).
- Pantalla nueva **Casa** en el menú: total del mes y del año, por categoría y por persona (se puede
  reusar el comparativo del superadmin y la vista anual), y los saldos entre personas.
- En el formulario de gasto: "Compartido con…" (personas de la casa y cómo se reparte).
- Chop: reconocer "a medias con", "compartido con" y los nombres de la casa.

Etapas posibles (cada una con su commit):
1. Casas y miembros (datos + pantalla para armarla).
2. Total de la casa (solo mirar, con las categorías juntadas por nombre).
3. Gastos compartidos en la web (formulario, partes, que cada uno vea su parte en sus totales).
4. Saldos y "saldar".
5. Chop (cargar compartidos, consultar la casa y las deudas, avisarle al otro).

## Qué revisar al hacerlo

- Que nadie vea gastos ajenos que no le corresponden (la "regla de oro" del `userId` se vuelve "el
  `userId` o la casa"): probar con dos cuentas que no son de la misma casa.
- El "ver como" del superadmin: que siga en solo lectura también en la casa.
- Totales: que la suma de las partes dé el total del gasto (repartir en centavos, como las cuotas en
  `createExpense`), y que el total de la casa no cuente dos veces un gasto compartido.
- Borrar una cuenta, salir de una casa o borrar una categoría con partes de gastos compartidos.
- Backups y la migración en el servidor (`deploy/update.sh`).
