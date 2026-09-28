# Estado del proyecto (para retomar desde cualquier compu)

Notas de trabajo para Felipe y para el agente (Claude Code). Se actualiza al cerrar cada sesión.
Lo técnico estable (arquitectura, tablas, comandos) está en el README; acá va **qué se hizo,
qué se decidió y qué falta**.

## Cómo trabajar con Felipe

- Habla español rioplatense. Sabe lógica pero está aprendiendo el stack: **codeá y explicá paso a
  paso** qué hiciste y por qué, con ejemplos del código real.
- Preferí preguntas numeradas en texto (1, 2, 3 con opciones a/b) antes que menús.
- Pedí confirmación antes de commitear, pushear o borrar datos.

## Última sesión: 2026-09-24/25 (compu nueva, levantada desde cero)

**Puesta en marcha**
- `.env` armado desde `.env.example` (no está en git: copialo por un medio seguro, nunca por el repo).
- npm bloqueaba scripts de instalación: se aprobaron `esbuild`, `prisma`, `@prisma/engines` y
  `unrs-resolver` (quedó en `package.json`, no hay que repetirlo).
- El seed fallaba por `server-only`: ahora corre con `--conditions=react-server` (`prisma.config.ts`).
- Túnel: ngrok con dominio fijo `clifton-monometrical-brook.ngrok-free.dev` (`npm run tunnel`). En
  cada compu hay que instalar ngrok y correr `ngrok config add-authtoken <token>` una vez.

**WhatsApp: conectado y probado.** Número de prueba de Meta, token **permanente** (no vence),
webhook en `https://clifton-monometrical-brook.ngrok-free.dev/api/whatsapp` con el campo
`messages` suscripto. Chop contesta el menú por WhatsApp.

**Categorías por cuenta** (migración `20260925025821_categorias_por_cuenta`)
- Antes: 11 categorías "base" compartidas (`userId` null), que nadie podía editar ni borrar.
- Ahora: cada cuenta tiene **sus propias** categorías. Al crear una cuenta se le copian las 11
  iniciales (`DEFAULT_CATEGORIES` / `ensureDefaultCategories` en `src/lib/services/categories.ts`),
  y desde ahí se editan y borran igual que las creadas a mano, sin afectar a nadie.
- Los **gastos nunca se compartieron** entre cuentas; lo único compartido era la lista de nombres.
- **"Otros" se puede borrar** (decisión de Felipe). Si no existe y Chop no encuentra la categoría
  de un gasto, se la **pregunta** con la lista (antes el gasto se descartaba sin avisar).
- Borrar una categoría con gastos: se elige **moverlos** a otra o **borrarlos** con ella.
- Arreglado de paso: en Chop, tocar una tarjeta de la lista en "Completar" respondía
  "Esa opción ya venció" (el estado `ai:missing` no aceptaba botones).

## Pendiente (en orden)

1. **API key de Anthropic: cargada y andando** (2026-09-28, compu con Docker). Falta probar el
   caso "categoría que no existe" por WhatsApp (debería preguntarla).
2. **Chop más barato y que maneje toda la app** — en curso, ver la sección "En curso: Chop" más abajo.
3. **Audios con Whisper.** Solo hay que implementar `src/lib/transcribe.ts`. Se decide según el
   servidor: sin placa de video conviene Whisper por API; local solo si el servidor tiene GPU o
   CPU de sobra. Falta también descargar el audio de Meta (llega como id, formato OGG/Opus).
4. **Subir al servidor** (todavía no está definido cuál). Ver "Antes de desplegar" en el README;
   lo más importante: backups de la base, dominio con HTTPS, número real de WhatsApp.

## En curso: dólar a pesos, resumen de tarjetas y gastos fijos (plan del 2026-09-26)

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
   guarda `recurringId` (único por día). Página `/fijos` (menú "Fijos"). Decisiones tomadas por
   defecto (Felipe puede cambiarlas):
   - Al crear un fijo cuyo día ya pasó este mes, empieza el mes que viene, salvo que se marque
     "Cargar también el de este mes".
   - Si pasás meses sin entrar, al volver carga todos los que faltan (cada uno con su fecha).
   - Borrar el gasto que cargó un fijo no hace que se vuelva a cargar. Borrar el fijo no borra
     sus gastos.
   - Se pueden **pausar**: al reanudar no se cargan los meses pausados.
   - Al cambiar el monto: "desde este mes" corrige también el gasto de este mes si ya se cargó;
     "desde el próximo" lo deja (y si todavía no se cargó, se carga con el monto viejo).
     Los demás cambios (categoría, medio, día...) valen para los meses que vienen.
   - Los fijos en USD guardan su dólar; la cotización es la del día en que se carga. Si no se
     consigue, no se carga y se reintenta la próxima vez.

**Al retomar:** las 3 etapas están commiteadas. Quedan por confirmar con Felipe las decisiones por
defecto de los fijos (lista de arriba). En la demo, los gastos en USD con crédito viejos siguen al
dólar tarjeta; `npm run db:demo` los regenera al oficial (cambia la contraseña de la demo).

**Lo de Chop que quedaba de estas etapas** va en las etapas 4 y 5 del plan de Chop (abajo): aviso por
WhatsApp de los fijos cargados, "Netflix aumentó a 12.000" y resumen de la tarjeta por Chop.

## En curso: Chop más barato y que maneje toda la app (plan del 2026-09-28)

Decisiones de Felipe: Chop va a manejar también fijos, resumen/pago de tarjeta, presupuestos,
categorías y tarjetas/billeteras (admin y cuenta, no). Un gasto simple se guarda directo con botón
**Deshacer**; borrar, editar y lo demás pide confirmación. Sin memoria entre mensajes. Ampliar el
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
3. **Carga directa con Deshacer** — hecha. Un gasto se guarda enseguida y la respuesta trae
   **↩️ Deshacer** (el id va en el botón, `undo:<id>.<id>`; borra también todas las cuotas; vale
   siempre, como los botones del menú). Antes de guardar pregunta solo lo imprescindible
   (`finishPending` en `menu.ts`): **"¿Cómo pagaste?"** si no dijo el medio (lista con efectivo, débito,
   crédito, sus billeteras y transferencia; antes suponía el más usado y Felipe prefirió que pregunte),
   **con qué** si no es efectivo y no lo dijo: tarjeta para débito y crédito (sin ella una compra con
   crédito no entra en el resumen de la tarjeta), billetera para transferencia (si contesta otro medio,
   "mercado pago", se cambia el medio; si no se entiende, se guarda sin). La lista de "¿cómo pagaste?"
   no tiene "Transferencia" suelta: van las billeteras por nombre (decisión de Felipe). Igual en los
   fijos y en la carga paso a paso del menú y **a qué dólar** si es en USD
   sin crédito (con crédito, oficial y lo avisa). Al guardar en USD muestra cuánto quedó en pesos.
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
6. **Menú completo + presupuestos y categorías** (pedido de Felipe, 2026-09-28): menú con 3 botones
   **➕ Agregar · 📊 Consultar · 🗑️ Eliminar**, cada uno abre una lista (gasto, fijo, tarjeta/billetera,
   categoría, presupuesto; en Consultar además "¿qué tengo que pagar?", resumen de tarjeta, fijos,
   presupuestos; consultas de gastos por tarjeta o medio). Presupuestos y categorías también por texto.
   Falta planificarla.
Regla: si al sumar secciones el prompt fijo pasa ~3000 tokens, se divide en dos llamadas (gastos en la
principal; el resto en una segunda llamada chica con el prompt de su sección).

## Pendientes chicos

- **Compu sin Docker (2026-09-28):** esta compu no tiene Docker ni `sudo`, así que la base se levantó
  con un PostgreSQL portátil (`embedded-postgres`) en una carpeta temporal, fuera del repo, en el
  puerto 5434. Si se reinicia la compu hay que volver a levantarla (o instalar Docker). El `.env`
  de acá tiene WhatsApp y la API key vacíos, y el admin es `fbrisig@gmail.com`.
- Después de una migración nueva hay que **reiniciar `npm run dev`**: si no, sigue con el cliente
  de Prisma viejo en memoria y la tabla nueva da `undefined`.
- **Docker sin sudo:** el usuario `laptop` no está en el grupo `docker`, así que `npm run db:up`
  falla. Arreglo: `sudo usermod -aG docker laptop` y volver a iniciar sesión.
- `npm run db:seed` **pisa la contraseña del admin** con la del `.env`. Felipe decidió no tocarlo por
  ahora (no hay datos importantes), pero no hay que correrlo en el servidor con datos reales.
- No hay tests automáticos: las pruebas de esta sesión se hicieron con scripts temporales. Para Chop
  está `npm run chop:bench` (ver arriba).
- En la compu con Docker, la demo tiene la Visa **sin** días de cierre/vencimiento (en la otra compu
  tenía 25/7). Las pruebas de Chop se los ponen un rato y los vuelven a sacar.
