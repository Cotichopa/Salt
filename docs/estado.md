# Estado del proyecto (para retomar desde cualquier compu)

Notas de trabajo para Felipe y para el agente (Claude Code). Se actualiza al cerrar cada sesión.
Lo técnico estable (arquitectura, tablas, comandos) está en el README; acá va **qué se hizo,
qué se decidió y qué falta**.

## Cómo trabajar con Felipe

- Habla español rioplatense. Sabe lógica pero está aprendiendo el stack: **codeá y explicá paso a
  paso** qué hiciste y por qué, con ejemplos del código real.
- Preferí preguntas numeradas en texto (1, 2, 3 con opciones a/b) antes que menús.
- Pedí confirmación antes de commitear, pushear o borrar datos.

## Hay dos compus

- **Compu con Docker** (usuario `estilo`, i7-7700): la base corre en Docker (`salt-gastos-db-1`,
  puerto 5434). Acá se hizo la sesión del 2026-09-28: tiene el `.env` completo (token permanente de
  WhatsApp, API key de Anthropic) y Whisper compilado en `~/whisper`.
- **Compu sin Docker** (usuario `felipe`): sin Docker ni `sudo`; la base es un PostgreSQL portátil
  (`embedded-postgres`) en `~/salt-db`, puerto 5434, que arranca sola (ver "Pendientes chicos").
  Puesta al día el 2026-09-29: pull, `npm install`, `.env` completo y Whisper compilado en `~/whisper`.

## Rutina después de cada `git pull` (en cualquier compu)

```
git pull
npm install                 # por si hay dependencias nuevas
npx prisma migrate deploy   # aplica las migraciones nuevas que trajo el pull
npm run dev                 # si ya estaba corriendo, reiniciarlo
```

- Una **migración** es una carpeta en `prisma/migrations/` con un `migration.sql` que crea o cambia
  tablas. Git la trae pero **no la aplica**: si el código nuevo usa una tabla que la base no tiene, falla.
- `npx prisma migrate status` muestra cuáles faltan aplicar.
- **`migrate deploy`** solo aplica las que ya existen (después de un pull, y en el servidor).
  **`migrate dev`** (`npm run db:migrate`) es para *crear* una migración cuando cambiás
  `schema.prisma`; si ve diferencias raras puede proponer borrar la base: no usarlo para ponerse al día.
- Si el `.env.example` trae variables nuevas, copiarlas al `.env` (los valores secretos, de la otra
  compu por un medio seguro, nunca por git).

## Para retomar en la otra compu (la sin Docker)

1. `git pull` — trae los 9 commits de Chop del 2026-09-28 (último `7b20ca1`).
2. `npm install` — hay una dependencia nueva, `ffmpeg-static` (baja el programa ffmpeg, ~80 MB).
3. Levantar la base portátil si la compu se reinició, y `npx prisma migrate status`: no hay
   migraciones nuevas desde el 2026-09-28 (la última, `gastos_fijos`, se hizo en esa compu).
4. **`.env`**: traer desde la compu con Docker, por un medio seguro (nunca por git), lo que allá falta:
   `ANTHROPIC_API_KEY` + `AI_PARSER_ENABLED=true`, y lo de WhatsApp (`WHATSAPP_TOKEN` permanente,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`). `DATABASE_URL` queda el
   de esa compu. Para los audios: dejar `WHISPER_CLI`/`WHISPER_MODEL` vacíos (Chop dice que todavía no
   escucha audios) o compilar whisper.cpp ahí (ver "Audios con Whisper local"; necesita cmake y gcc).
5. **ngrok: una sola compu a la vez.** Las dos usan el mismo dominio fijo: cerrar el túnel en una antes
   de abrirlo en la otra. Después: `npm run dev` y `npm run tunnel` (cada uno en su terminal).
6. Probar: mandarle "hola" a Chop por WhatsApp (tienen que salir los botones ➕ Agregar · 📊 Consultar ·
   🗑️ Eliminar). Si Chop no contesta, revisar el token (ver "Pendientes chicos").
7. `npm run chop:bench -- <nombre>` funciona si está la API key (cuesta ~US$ 0,04 por corrida).

## Última sesión: 2026-09-28 (compu con Docker)

- **Chop maneja toda la app** por WhatsApp y el chat web: gastos, fijos, tarjetas y billeteras
  (resúmenes, marcar pagado, "¿qué tengo que pagar?"), presupuestos y categorías, por texto, por
  audio o con el menú de botones (➕ Agregar · 📊 Consultar · 🗑️ Eliminar). Detalle abajo, en
  "Chop más barato y que maneje toda la app".
- **Costo**: ~US$ 0,001 por mensaje (−67% vs. el principio); 16 de 37 mensajes del banco van sin IA.
  Felipe decidió no optimizar más (el ahorro que queda es de centavos por mes).
- **Todo gasto se confirma antes de guardarse** (decisión de Felipe, por los audios), con Deshacer.
- **Audios** con Whisper local (modelo small) — ver "Audios con Whisper local".
- **Subir al servidor**: lo hace Felipe con su papá, fuera de estas sesiones.

## Historial: sesión 2026-09-24/25 (compu sin Docker, levantada desde cero)

- `.env` armado desde `.env.example`. npm bloqueaba scripts de instalación: se aprobaron `esbuild`,
  `prisma`, `@prisma/engines` y `unrs-resolver` (quedó en `package.json`). El seed corre con
  `--conditions=react-server` (`prisma.config.ts`).
- Túnel: ngrok con dominio fijo `clifton-monometrical-brook.ngrok-free.dev` (`npm run tunnel`). En cada
  compu: instalar ngrok y `ngrok config add-authtoken <token>` una vez.
- **WhatsApp**: número de prueba de Meta, token **permanente** (no vence), webhook en
  `https://clifton-monometrical-brook.ngrok-free.dev/api/whatsapp` con el campo `messages` suscripto.
- **Categorías por cuenta** (migración `20260925025821_categorias_por_cuenta`): cada cuenta tiene sus
  propias categorías (al crearla se le copian las 11 iniciales, `ensureDefaultCategories`). "Otros" se
  puede borrar; borrar una categoría con gastos pide moverlos o borrarlos.

## Pendiente

1. **Subir al servidor** — lo hacen Felipe y su papá. Ver "Antes de desplegar" en el README; lo más
   importante: backups de la base, dominio con HTTPS, número real de WhatsApp. En el servidor también
   hay que compilar whisper.cpp (ver "Audios con Whisper local").
2. **Tickets en PDF y adjuntos** (plan del 2026-09-29, en etapas; cada una se commitea aparte):
   1. ~~Chop por WhatsApp: PDF y fotos como documento~~ — hecha (ver "Hecho: fotos de tickets").
   2. ~~Web: el ticket se ve dentro de la app~~ — hecha: `src/components/receipt-viewer.tsx` (visor encima
      del diálogo del gasto, con zoom y Descargar; el PDF se dibuja con pdf.js en `<canvas>`, cargado
      solo al abrirlo, con su worker como módulo en la misma página).
   3. ~~Chat de Chop en la web: botón ➕~~ — hecha: "Adjuntar foto" / "Adjuntar archivo" (`chop-chat.tsx`);
      las fotos se achican en el navegador (1568 px JPEG) y todo pasa por `sendReceiptToChop` →
      `processReceipt`. Otros archivos se rechazan en el navegador y en el servidor. Límite de las Server
      Actions subido a 6 MB (`next.config.ts`) para PDFs de hasta 5 MB.
   4. ~~Formulario de gasto: "Adjuntar ticket"~~ — hecha: al cargar uno nuevo la IA lo lee y completa
      el formulario (`readReceiptForForm` en `actions/expenses.ts`, con el comercio por CUIT); al editar
      un gasto sin ticket, solo lo adjunta (decisión: no pisar lo cargado). El ticket viaja en el campo
      oculto `receiptId` y el servicio chequea que sea de la persona. Chop y el formulario comparten
      `readReceipt` (`src/lib/services/receipt-reading.ts`); `shrinkPhoto` (`src/lib/shrink-photo.ts`)
      achica las fotos en el navegador para los dos.
3. Los "Pendientes chicos" del final.
4. **Versión 1.0** (decidido el 2026-10-01, ver "Rumbo a la v1").

## Rumbo a la v1 (2026-10-01)

Felipe decidió versionar sin sumar funciones nuevas. Antes de la etiqueta `v1.0.0` se cierran dos huecos
de seguridad y datos; otros (tope de IA por persona, que el seed no pise la contraseña del admin, tests
mínimos) quedan para después. Contexto: la usa solo la familia; cada cuenta sigue separada (sin
total de la casa ni gastos compartidos), y va a correr en una **VM de Proxmox**.
1. ~~Límite de intentos en el login~~ — hecha: 5 contraseñas mal en 15 minutos para un mismo email lo
   bloquean hasta que el más viejo de esos intentos tenga 15 minutos (`src/lib/services/login-attempts.ts`,
   tabla `login_attempts`, migración `intentos_login`). Bloqueado, ni se prueba la contraseña ni se
   anotan intentos nuevos. Va por email (también los que no existen, para no revelar cuáles tienen
   cuenta). Entrar bien o cambiar la contraseña con el link del mail borra los intentos.
2. **Backups de la base** — pendiente.
3. Después: `package.json` a 1.0.0 y `git tag v1.0.0`.

## Hecho: fotos de tickets (2026-09-29)

Se le manda a Chop por WhatsApp la foto de un ticket (con texto opcional, que manda sobre la foto:
"fue con la visa en 3 cuotas"). Chop la guarda achicada (JPEG 1568 px, tabla `receipts`), la lee con
Haiku 4.5 (`parseReceipt` en `ai-parser.ts`: total final, fecha, comercio, categoría y, si figura, medio,
tarjeta y cuotas; ~US$ 0,0017 por foto) y propone el gasto por el camino de siempre (preguntas,
confirmación, correcciones). La foto viaja en el borrador de la sesión (`Draft.receiptId`) y queda en
`expenses.receiptId` (en cuotas, todas la comparten). Fotos sin gasto se borran solas al día siguiente.
En la web: ícono 🧾 en la lista y la foto en el diálogo de edición, servida por `/api/tickets/[id]`
(solo al dueño). Decisión de Felipe: por ahora solo por WhatsApp, no desde el chat web.

**Comercio por CUIT → categoría** (2026-09-29, migración `comercios_cuit`). La IA también lee el CUIT
del emisor; `validCuit` (`src/lib/services/merchants.ts`) chequea el dígito verificador y descarta los
mal leídos. El CUIT queda en `receipts.cuit`, y al guardar el gasto se anota en la tabla `merchants`
(por cuenta: CUIT → categoría). El próximo ticket de ese CUIT viene con esa categoría ("la de la última
vez en este comercio"). Decisiones de Felipe: vale **la última** categoría (si la cambiás al confirmar o
después, en la web o por Chop, se actualiza: `updateExpense`); si el texto de la foto nombra una
categoría, **manda el texto**. Al confirmar, Chop cuenta qué pasa con el comercio (`merchantNote` en
`menu.ts`: "Guardo este comercio (CUIT …) en …", "es la de la última vez", "estaba en X: lo paso a Y" o
"no pude leer el CUIT"). En la web, cada categoría muestra la tarjeta **Comercios** (si tiene alguno)
para pasarlos a otra categoría u olvidarlos. Al borrar una categoría moviendo sus gastos, los
comercios se mueven con ellos.
**Facturas en PDF** (2026-09-29): por WhatsApp como documento (📎). También fotos mandadas "como
documento" (llegan sin comprimir); otros archivos se rechazan (`receiptKind` en `bot.ts`). El PDF se
guarda completo en `receipts` (`mimeType` application/pdf) y la IA lee solo la **primera página** (las de
ARCA repiten la página como ORIGINAL/DUPLICADO/TRIPLICADO): su **texto**, sacado con pdf.js
(`firstPageText` en `receipts.ts`; exacto y ~US$ 0,0016), o si no tiene texto (escaneo) la primera página
como documento (pdf-lib). Ojo: los PDF de ARCA vienen **cifrados sin contraseña** (se abren pero "no
copiar"); pdf-lib no los abre, pdf.js sí. `processReceipt` (`bot.ts`) procesa foto o PDF para cualquier
origen. La IA no juzga si un comprobante "es un gasto": todo lo que tenga total se propone.
Límite visto: con fotos chicas (una captura de 507 px de una factura) Haiku lee mal los dígitos del CUIT
y el QR de ARCA es muy chico para decodificarlo; el verificador lo rechaza y ese ticket no se asocia.

## Hecho: buscador en el Inicio (2026-09-29)

El buscador de Gastos ya existía completo (`src/lib/expense-search.ts`: todo el historial, errores de
tipeo, montos, fechas y meses, con total y exportar). Se sumó un campo en el Inicio que manda a
`/gastos?q=...`. Chop no busca por descripción: Felipe prefirió no sumarlo por ahora.

**Ojo al diagnosticar Chop:** muchas frases se resuelven sin IA (quick-parser) y otras parecidas no
("cuánto llevo gastado de ropa" va sin IA; "... en ropa este año" necesita IA). Si la IA falla, Chop
ahora dice "No pude entender ese mensaje: la IA no me respondió". El 2026-09-29 la API de Anthropic
devolvía "503 credential validation failed" (problema pasajero de ellos: la consola mostraba
"Temporarily unable to authenticate"). Para ver qué pasó con un mensaje de WhatsApp: la inspección de
ngrok en http://127.0.0.1:4040 muestra cada pedido del webhook con su texto.

## Hecho: preferencias y perfil (2026-09-29)

En **Mi cuenta**: nombre (el que usa Chop) y WhatsApp (pide la contraseña actual; avisa si el número es
de otra cuenta), y **Preferencias**: pantalla de inicio (`/` redirige ahí; también después del login),
moneda de los totales (Inicio y detalle de categoría, si la URL no dice otra), color principal
(`data-accent` en `<html>` + variables en `globals.css`), medio de pago y dólar de siempre (preelegidos en
los formularios de gastos y fijos vía `FormDefaultsProvider`, y primeros con "⭐ El de siempre" en las
listas de Chop). Campos en `users` (migración `preferencias`); opciones en `src/lib/preferences.ts`.
Ojo: a un `Select` de Base UI no se le puede cambiar el `defaultValue` una vez montado (por eso el
formulario de preferencias fija sus valores iniciales con `useState`).

## Hecho: olvidé mi contraseña (2026-09-29)

- Login → "¿Olvidaste tu contraseña?" → `/recuperar` (email) → mail con link a `/recuperar/<token>` →
  contraseña nueva → login con aviso. Probado de punta a punta por Felipe.
- Mails por Gmail con contraseña de aplicación (`src/lib/mail.ts`, `nodemailer`; `GMAIL_USER`,
  `GMAIL_APP_PASSWORD`). El link se arma con `APP_URL` (en esta compu apunta al túnel de Cloudflare:
  **cambiarlo cada vez que cambie el túnel**, y en el servidor, a su dominio).
- Tabla `password_resets` con el hash del token; vence en 1 hora, sirve una vez, pedir otro anula los
  anteriores, máximo 3 por hora. Responde igual exista o no el email.
- Las pantallas sin sesión comparten `src/components/auth-shell.tsx` (con "Made by Estilo").
- El mail usa la plantilla `mailLayout` (`mail.ts`): tarjeta blanca, ánfora adjunta por `cid` (Gmail
  no muestra SVG), botón negro y "Made by Estilo". Sirve para mails futuros.

## Hecho: app instalable (PWA) y "Made by Estilo" (2026-09-29)

- `src/app/manifest.ts` (nombre, íconos en `public/icons/`, `display: standalone`), `public/sw.js` (service
  worker mínimo, sin caché; lo registra `src/components/service-worker.tsx`), color de barra y datos de
  iPhone en `layout.tsx`. El proxy deja pasar `manifest.webmanifest` y `sw.js` sin sesión.
- **Con ngrok NO se puede instalar**: Chrome pide el manifiesto sin cookies y ngrok gratis le devuelve su
  página de advertencia. Para probar se usa **Cloudflare Tunnel** (sin advertencia):
  `~/tools/cloudflared tunnel --url http://localhost:3001` → da una dirección `*.trycloudflare.com`
  **que cambia cada vez** (sirve para probar; para dejarla instalada hace falta dirección fija: el servidor
  o un túnel con nombre, ej. `salt.estilo.com.ar`). Los dos túneles están en `allowedDevOrigins`.
  Probado en Android: se instala y anda.
- La sesión se renueva sola al usar la app (`renewedSession` en `session.ts`, desde el proxy): solo vence
  tras 30 días sin abrirla.
- Login: "Made by Estilo" con link a https://estilo.com.ar/.
- Ícono de la app: el ánfora **de líneas** (blanca sobre negro, trazo 1,6). La favicon del navegador sigue
  siendo el ánfora lleno (`src/app/icon.svg`).
- **Animación al abrir** desde el ícono instalado (`src/components/splash.tsx` + final de `globals.css`,
  ~2 s): arranca igual que la pantalla de carga de Android, el ánfora se llena de sal de abajo hacia
  arriba, aparece "Salt" y se desvanece. Un script previo al pintado decide si mostrarla (solo instalada,
  una vez por apertura, no con "reducir animaciones").

## Hecho: avisos de Chop (2026-09-29)

Chop cuenta cosas de la cuenta sin que se las pregunten: **vencimiento de tarjeta** (3 días antes y el
día anterior, si no está pagada; necesita cierre y vencimiento configurados), **resumen de la semana
pasada** (lunes a domingo) y **del mes pasado** (con los presupuestos que se pasaron). Decisiones de
Felipe:
- Por el límite de 24 h de Meta, **se entregan cuando Felipe le escribe** (sin plantillas pagas):
  con "hola" van en el saludo ("¡Hola Felo! … *Además:* …"); con otro mensaje, aparte y antes de la respuesta.
- Se prenden/apagan en **Cuenta → Avisos de Chop** (`notifyCardDue`, `notifyWeekly`, `notifyMonthly` en `users`).
- El aviso de presupuesto queda como estaba (lo da Chop al cargar; lo de la web se ve solo en pantalla).

Cómo funciona: `pendingNotices` (`src/lib/services/notices.ts`) arma los que falten y los guarda en la
tabla `notices` con una clave única (`due3:`/`due1:<tarjeta>:<mes>`, `week:<lunes>`, `month:<mes>`) para
no repetirlos; se llama al principio de `handleInput` (`bot.ts`), igual que `noticeLoadedFixed`.
Por defecto (Felipe puede cambiarlo): si pasan varias semanas sin escribir, va solo la última; si no
hubo gastos en el período, no se manda; los resúmenes van en pesos y sin centavos.
El primer resumen mensual es el de **septiembre 2026** (llega en octubre; `FIRST_MONTHLY`, decisión de Felipe).

## Hecho: dólar a pesos, resumen de tarjetas y gastos fijos (plan del 2026-09-26)

Plan completo en 3 etapas (cada una se revisa y commitea por separado):
1. **Dólar a pesos** — hecha y commiteada (`f0559b3`). Cada gasto guarda su valor en pesos y en dólares con
   la cotización de su día (`src/lib/services/exchange-rates.ts`). Toda la app suma en pesos, y
   "En dólares" muestra lo mismo convertido. Los gastos viejos no se convirtieron (decisión de Felipe).
2. **Resumen de cada tarjeta de crédito** — hecha y commiteada. Cierre y vencimiento por día fijo
   (en el diálogo de la tarjeta), corregibles por resumen; pesos y dólares por separado; dólares al
   dólar oficial del vencimiento (antes era el dólar tarjeta; se cambió el 2026-09-28 porque el
   banco cobra al oficial del día). Pantalla `/medios/[id]`: abre en el resumen a pagar (o el abierto).
   Se marca como **pagado** (pago completo, no parcial; no se registra como gasto, decisión de
   Felipe) y muestra **en qué cuota va** cada compra en cuotas y cuánto queda.
   En la demo, la Visa tiene cierre 25 y vencimiento 7 (la Mastercard, sin configurar).
**Dólar oficial con crédito (2026-09-28, decisión de Felipe):** el banco cobra al oficial del día.
El resumen de la tarjeta usa el oficial (de hoy como estimado, del vencimiento si venció, del día
del pago al marcarlo pagado). Un gasto en USD con crédito va siempre al oficial y el formulario lo
avisa en vez de preguntar; con otro medio se elige el dólar. Los gastos viejos quedaron como estaban
(al editar uno con crédito, pasa al oficial).

3. **Gastos fijos** — hecha (2026-09-28). Se cargan solos cada mes al abrir Inicio, Gastos o Fijos
   (`loadDueRecurring` en `src/lib/services/recurring.ts`), con un **solo aviso** que lista todo lo
   cargado (`src/components/recurring-notice.tsx`). Tabla `recurring_expenses`; cada gasto cargado
   guarda `recurringId` (único por día). Página `/fijos` (menú "Fijos"). Reglas (confirmadas
   por Felipe el 2026-09-29):
   - Al crear un fijo cuyo día ya pasó este mes, **siempre se pregunta** si cargar el de este mes
     (en la web, una opción obligatoria sin nada marcado; en Chop, dos botones).
   - Si pasás meses sin entrar, al volver carga todos los que faltan (cada uno con su fecha).
   - Borrar el gasto que cargó un fijo no hace que se vuelva a cargar. Borrar el fijo no borra
     sus gastos.
   - Se pueden **pausar**. Al reanudar, si hubo meses que llegaron a su día mientras estaba pausado
     (`pausedMonths`), **se pregunta** si cargarlos (web y Chop); si no, sigue desde el próximo.
   - Al cambiar el monto: "desde este mes" corrige también el gasto de este mes si ya se cargó;
     "desde el próximo" lo deja (y si todavía no se cargó, se carga con el monto viejo).
     Los demás cambios (categoría, medio, día...) valen para los meses que vienen.
   - Los fijos en USD guardan su dólar; la cotización es la del día en que se carga. Si no se
     consigue, **se carga igual en dólares** (sin valor en pesos) y se convierte solo en una próxima
     carga (`convertPendingRecurring`). Ojo: `getRate` usa la última cotización guardada si la API
     está caída, así que esto pasa solo si no hay ninguna guardada de ese dólar.

Las 3 etapas están commiteadas. En la demo, los gastos en USD con crédito viejos siguen al dólar tarjeta;
`npm run db:demo` los regenera al oficial (cambia la contraseña de la demo).

## Hecho: Chop más barato y que maneje toda la app (plan del 2026-09-28)

Decisiones de Felipe: Chop va a manejar también fijos, resumen/pago de tarjeta, presupuestos,
categorías y tarjetas/billeteras (admin y cuenta, no). ~~Un gasto simple se guarda directo con botón
Deshacer~~ → **cambió el 2026-09-28: todo gasto se confirma antes de guardar** (con los audios, Whisper
puede entender mal un número): primero pregunta lo que falte (medio, tarjeta, dólar), después
"¿Guardo este gasto?" [Guardar] [Cancelar] o una corrección escrita, y al guardar queda **Deshacer**.
Borrar, editar y lo demás también pide confirmación. Sin memoria entre mensajes. Ampliar el
pre-filtro sin IA. Medir antes y después de cada cambio.

**Cómo se mide:** `npm run chop:bench -- <etiqueta>` (`scripts/chop-bench.ts`) pasa 34 mensajes fijos por
el mismo camino que Chop (pre-filtro y después IA), muestra qué entendió y cuántos tokens gastó, y lo
compara con la corrida anterior (guardadas en `scripts/.bench/`, fuera de git). Cuesta ~US$ 0,04.

Etapas (cada una se commitea aparte):
0. **Banco de pruebas** — hecha. Base: 2.956 tokens de entrada + 132 de salida = US$ 0,0031 por mensaje.
1. **IA más barata** — hecha. Se sacó el "structured outputs": el esquema viajaba en cada mensaje y
   pesaba ~1.700 tokens (tool use pesaba más todavía). Ahora el prompt muestra la respuesta con 5
   ejemplos JSON de una línea, se prellena `{` y se valida con zod (si viene mal, se descarta).
   Resultado: 1.012 + 50 tokens = **US$ 0,0011 por mensaje (−65%)**, mismos aciertos.
   La caché queda descartada (el prompt está lejos de los 4096 tokens que pide Haiku 4.5).
2. **Pre-filtro sin IA para consultas** — hecha. `parseQuickQuery` en `quick-parser.ts` entiende
   "cuánto gasté / qué gasté / gastos / cómo vengo" + período, categoría (o palabra clave), tarjeta y
   medio; "borrá / eliminá el último" también es sin IA (`isDeleteLast`). `parseWithoutAI` junta todo
   y lo usan `bot.ts` y el banco. En el banco: 12 de 34 sin IA, **US$ 0,00084 por mensaje (−73% vs. la base)**.
3. **Carga con Deshacer** — hecha (y después cambiada: ahora **se confirma antes de guardar**, ver
   arriba). Originalmente un gasto se guardaba enseguida; hoy, al guardar, la respuesta trae
   **↩️ Deshacer** (el id va en el botón, `undo:<id>.<id>`; borra también todas las cuotas; vale
   siempre, como los botones del menú). Antes de guardar pregunta solo lo imprescindible
   (`finishPending` en `menu.ts`): **"¿Cómo pagaste?"** si no dijo el medio (lista con efectivo, débito,
   crédito y transferencia; antes suponía el más usado y Felipe prefirió que pregunte),
   **con qué** si no es efectivo y no lo dijo: tarjeta para débito y crédito (sin ella una compra con
   crédito no entra en el resumen de la tarjeta), billetera para transferencia (si contesta otro medio,
   "mercado pago", se cambia el medio; si no se entiende, se guarda sin). La lista de "¿cómo pagaste?"
   tiene Efectivo, Débito, Crédito y Transferencia; después de Transferencia, Chop muestra las billeteras (cambió el 2026-09-29, decisión de Felipe: antes iban las billeteras por nombre). Igual en los
   fijos y en la carga paso a paso del menú. Y **a qué dólar** si es en USD sin crédito (con
   crédito, oficial y lo avisa). Al guardar en USD muestra cuánto quedó en pesos.
   Varios gastos en un mensaje siguen con "Guardar todos" (y también tienen Deshacer). La carga paso a
   paso del menú termina por el mismo camino. Se sacó el botón "Completar" (descripción/tarjeta
   opcionales). Los resúmenes de Chop suman **en pesos** (`amountArs`); solo los USD viejos sin
   convertir quedan aparte. Las correcciones después de guardar van por "editar" (con confirmación).
4. **Gastos fijos por Chop** — hecha. Arquitectura de **secciones** (`src/lib/whatsapp/sections/`): la IA
   principal solo detecta `{"accion":"seccion","cual":"fijo"}` (+~90 tokens al prompt) y la sección hace
   una **segunda llamada chica** con sus instrucciones (`askModel` en `ai-parser.ts`, ~650 tokens). Así los
   gastos no pagan los tokens de las secciones. "fijos" / "mis fijos" van sin IA.
   `sections/fijos.ts`: lista, crear (pregunta lo que falte: categoría, día, medio, tarjeta si es
   crédito, dólar si es USD sin crédito; si el día ya pasó: "Crear" o "Crear y cargar"), cambiar el monto
   (desde este mes / el próximo, misma regla que la web), pausar, reanudar y borrar. Todo lo que cambia
   datos pasa por la **confirmación genérica** (`sections/confirm.ts`, estado `confirm:action`,
   botones `act:<opción>`), que ejecuta `sections/index.ts`. Los **fijos que tocan se cargan con el
   primer mensaje** a Chop y se avisan en un solo mensaje (`noticeLoadedFixed` en `bot.ts`).
   Lecciones con Haiku: inventa datos que no dijiste (día 1 para el alquiler, el medio del ejemplo) y a
   veces responde `null` en vez de omitir. Por eso: los `null` se ignoran en `askModel`, y el día, el
   medio y la tarjeta de un fijo solo se aceptan si están en el mensaje; "aumentó a" es siempre cambio
   de monto (si ese fijo no existe, lo avisa en vez de crearlo).
5. **Tarjetas, billeteras y "¿qué tengo que pagar?"** — hecha. `sections/tarjetas.ts` (misma
   arquitectura que fijos, segunda llamada de ~420 tokens):
   - **Resumen** ("¿cuánto me viene en la Visa?", "resumen visa" sin IA): el último resumen cerrado sin
     pagar (o el abierto), con estado, cierre, vencimiento, total en pesos (USD al oficial) y cuotas. Si
     quedó otro anterior sin marcar, lo avisa. Botones **✅ Marcar pagado** (`pay:<tarjeta>:<mes>`,
     valen siempre). Tarjeta sin días: lo gastado con crédito este mes.
   - **Marcar pagado** ("pagué la visa"): si hay dos pendientes pregunta cuál; si tiene dólares, si los
     pagó en pesos o en dólares. Igual que la web: fecha de hoy, dólar oficial y total estimado (se
     corrige en la web si el banco cobró otro número). Con **↩️ Deshacer** (`unpay:`).
   - **Días de cierre/vencimiento** ("la visa cierra el 25 y vence el 7") y **agregar tarjeta o
     billetera** ("agregá la tarjeta galicia"; si no dice cuál es, pregunta con botones).
   - **"¿Qué tengo que pagar?"** (sin IA; decisiones de Felipe): lo que vence **este mes** sin pagar
     (y los resúmenes vencidos sin marcar), tarjetas sin días con lo gastado a crédito este mes ("sin
     fecha de vencimiento") y los fijos que faltan cargar este mes (los fijos a crédito no, ya van en el
     resumen). Total en pesos.
   - En cualquier confirmación, si la persona escribe otra cosa, la confirmación se deja y el
     mensaje se procesa normal (antes volvía a preguntar).
   - Banco: 32/36 (fallan solo presupuestos y categorías), US$ 0,00098 por mensaje.
6. **Menú completo + presupuestos y categorías** (pedido de Felipe, 2026-09-28). En dos partes:
   - **6a — menú nuevo** — hecha. El menú principal son 3 botones **➕ Agregar · 📊 Consultar ·
     🗑️ Eliminar** y cada uno abre una lista (`sections/listas.ts`). Agregar: gasto, fijo (paso a paso:
     nombre, monto y lo de siempre; si el nombre es palabra clave de una categoría, "luz" → Servicios,
     no la pregunta), tarjeta o billetera (tipo, nombre, días o "sin días"). Consultar: ¿qué tengo que
     pagar?, gastos (se sumaron "por tarjeta o billetera" y "por medio de pago", del mes), resumen de una
     tarjeta, fijos, medios de pago. Eliminar: gasto, fijo, tarjeta o billetera (avisa que sus gastos y
     fijos quedan sin ella). Botones sin estado: `go:<rama>:<opción>`, `sel:<qué>:<id>`,
     `page:<qué>:<n>` (listas de más de 10). "agregar/consultar/eliminar" escritos también abren el menú
     si no hay otra pregunta pendiente.
   - **6b — presupuestos y categorías** — hecha. `sections/presupuestos.ts`: poner o cambiar
     ("poneme 200 mil de presupuesto en comida", con antes/después), sacar, "mis presupuestos" (sin IA).
     `sections/categorias.ts`: crear (el ícono lo elige Chop por el nombre: Regalos → 🎁, si no 🏷️; se
     cambia en la web), renombrar, borrar (con gastos: "pasarlos a otra" → lista, o "borrarlos" con
     una segunda confirmación porque no se deshace), "mis categorías" (sin IA). Las dos también en los
     menús Agregar / Consultar / Eliminar. El monto y la categoría de un presupuesto solo se aceptan si
     están en el mensaje (`saidAmount` en `ai-parser.ts`).
     Los datos de los íconos (clave, emoji, nombre) se separaron a `src/lib/category-icon-data.ts`:
     `lucide-react` no carga del lado del servidor. `category-icon.tsx` los re-exporta con los dibujos,
     así que las pantallas no cambiaron.
     Las 4 secciones van en **una sola línea** del prompt principal (con un ejemplo concreto: el
     ejemplo con `fijo|tarjeta|...` confundía al modelo). "editar" sin cambios y con "borrá/eliminá"
     se toma como eliminar, y "borrá / eliminá / sacá (el gasto de) X" se resuelve sin IA
     (`deleteTarget` en `quick-parser.ts`, salvo que hable de categoría, presupuesto, fijo o tarjeta).
     Banco final: 37/37, prompt principal ~1.190 tokens, ~US$ 0,001 por mensaje (−67% vs. la base
     aunque Chop maneja toda la app).
   - **Preguntas de Chop con memoria** (2026-09-28, lo encontró Felipe: "¿cuál es el nombre nuevo?" →
     "Market" se perdía). "Sin memoria" sigue valiendo para la charla, pero cuando **Chop pregunta algo**
     (`askFollowup` en `sections/confirm.ts`, estado `followup`) guarda el mensaje original y la
     pregunta; la respuesta se interpreta junto con eso (`bot.ts`), salvo que se entienda sola
     ("nafta 5000", "cuánto gasté hoy": mensaje nuevo). Vale para las 4 secciones y para la pregunta de
     la IA principal ("¿en qué categoría?"). Los datos que pueden faltar (nombre nuevo, monto...) son
     opcionales en los esquemas y se preguntan; renombrar al mismo nombre = falta el nombre.
     `askModel` toma solo el primer objeto JSON completo (a veces el modelo escribe algo después).
Regla: si al sumar secciones el prompt fijo pasa ~3000 tokens, se divide en dos llamadas (gastos en la
principal; el resto en una segunda llamada chica con el prompt de su sección).

## Hecho: audios con Whisper local (2026-09-28)

Felipe eligió **Whisper en la propia compu** (whisper.cpp). En la compu con Docker (i7-7700, 8 hilos,
AVX2, sin GPU NVIDIA) está compilado en `~/whisper/whisper.cpp` (fuera del repo), con los modelos base,
small y large-v3-turbo-q5_0 en `models/`. Velocidad con 11 s de audio: base 1,3 s, small 4 s, turbo
20 s (descartado). **Modelo elegido: small** (~4 s por audio; con los audios de Felipe entendió bien casi
todo; base ya se equivocaba palabras).
- `src/lib/transcribe.ts`: ffmpeg (paquete npm `ffmpeg-static`, sin sudo; en `serverExternalPackages`
  de `next.config.ts`) pasa el audio a WAV 16 kHz → `whisper-cli` en español, con una pista de palabras
  (Chop, lucas, sus categorías y tarjetas). Máximo 60 s (decisión de Felipe). Saca "Chop/Job/Shop" del
  principio (el nombre del bot).
- WhatsApp: `downloadMedia` en `client.ts` baja la nota de voz con el id de Meta; `bot.ts` contesta
  "🎙️ Entendí: «…»" y la procesa como texto (y como todo gasto, se confirma antes de guardar). El chat
  web (micrófono) hace lo mismo.
- `.env`: `WHISPER_CLI` y `WHISPER_MODEL` (ruta a `ggml-small.bin`), `WHISPER_THREADS` opcional,
  `WHISPER_KEEP_DIR` solo para pruebas (guarda copias de los audios). Sin las dos primeras, Chop dice
  que todavía no escucha audios. Ver `.env.example`.
- **En el servidor**: clonar y compilar whisper.cpp igual (`cmake -B build -DGGML_NATIVE=ON` y
  `cmake --build build -j`), bajar `ggml-small.bin` con `models/download-ggml-model.sh small` y
  apuntar las dos variables. Si el servidor es más lento, medir: con base es ~3 veces más rápido.
- Además: "me cargás / cargame / anotame / porfa" son relleno para el pre-filtro; si el mensaje nombra
  una sola tarjeta o billetera y la IA no la puso, se completa; en los mensajes de Chop el `$` va
  pegado al número ("$100.000", `tightMoney` en `outbox.ts`) porque WhatsApp toma "100.000" suelto
  como teléfono.

## Pendientes chicos

- `npm audit` marca 4 vulnerabilidades altas que vienen de Prisma (`deepmerge-ts` y `mysql2`,- **Compu sin Docker:** no tiene Docker ni `sudo`, así que la base es un PostgreSQL portátil
  (`embedded-postgres`) en `~/salt-db` (fuera del repo), puerto 5434, datos en `~/salt-db/data`.
  Arranca sola al iniciar sesión (servicio de usuario `salt-db` de systemd):
  - Ver si anda: `systemctl --user status salt-db` · Reiniciarla: `systemctl --user restart salt-db`
  - Log: `journalctl --user -u salt-db -n 20`
  - Antes estaba en una carpeta temporal y se borró al reiniciar (2026-09-29; no tenía datos
    importantes). Se rearmó con `prisma migrate deploy`, `db:seed` y `db:demo`.
  - `.env`: WhatsApp, API key y Whisper cargados. El admin es `fbrisig@gmail.com`.
  - Whisper: `~/whisper/whisper.cpp` con el modelo small, compilado con un `cmake` portátil
    (`~/tools/cmake-3.31.6-linux-x86_64/bin`, bajado de GitHub porque no hay `sudo` ni `pip`).
 WhatsApp y la API
  key vacíos (ver "Para retomar en la otra compu"); el admin es `fbrisig@gmail.com`.
- **Si Chop no contesta por WhatsApp:** revisar el token con
  `GET graph.facebook.com/<versión>/debug_token?input_token=<T>&access_token=<T>`: `expires_at: 0` =
  permanente; "Session has expired" = vencido (el 2026-09-28 la compu con Docker tenía uno temporal
  vencido y se reemplazó por el permanente). Al cambiar el `.env` hay que reiniciar `npm run dev`.
- Después de una migración nueva hay que **reiniciar `npm run dev`**: si no, sigue con el cliente
  de Prisma viejo en memoria y la tabla nueva da `undefined`.
- **Docker sin sudo (compu sin Docker):** el usuario `laptop` no está en el grupo `docker`, así que
  `npm run db:up` falla. Arreglo: `sudo usermod -aG docker laptop` y volver a iniciar sesión.
- `npm run db:seed` **pisa la contraseña del admin** con la del `.env`. Felipe decidió no tocarlo por
  ahora (no hay datos importantes), pero no hay que correrlo en el servidor con datos reales.
- No hay tests automáticos: las pruebas de esta sesión se hicieron con scripts temporales. Para Chop
  está `npm run chop:bench` (ver arriba).
- En la compu con Docker, la demo tiene la Visa **sin** días de cierre/vencimiento (en la otra compu
  tenía 25/7). Las pruebas de Chop se los ponen un rato y los vuelven a sacar.
