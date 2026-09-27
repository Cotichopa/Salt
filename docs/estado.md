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

1. **API key de Anthropic.** Felipe ya tiene una (no crear otra); la trae de la oficina. Cargarla
   en `ANTHROPIC_API_KEY`, poner `AI_PARSER_ENABLED=true` y probar texto libre por WhatsApp,
   incluido el caso "categoría que no existe" (debería preguntarla).
2. **Seguir bajando el consumo de tokens de Chop.** Ya hecho: pre-filtro sin IA
   (`src/lib/whatsapp/quick-parser.ts`) que resuelve los mensajes simples de carga ("nafta 15000",
   "ayer 5 lucas en el chino con la visa", "10 lucas de nafta descripcion nafta ypf pague efectivo")
   sin llamar a la API; si queda una palabra que no conoce, pasa a la IA. La descripción va después
   de "descripcion"/"desc"/"detalle" y se corta en "pague", un medio de pago o una tarjeta (no en
   "con", para no romper "cena con amigos"). En el log aparece `[quick-parser] resuelto sin IA`. Con la key:
   - Medir primero: mandar ~20 mensajes reales variados y anotar el `[ai-parser] X+Y tokens` de cada uno.
   - Esquema de respuesta más corto: hoy la IA rellena `consulta`, `objetivo` y `cambios` aunque
     no apliquen (hacerlos `nullable`), y acortar descripciones. Medir de nuevo y comparar.
   - Prompt más compacto (sin perder los ejemplos que importan).
   - La caché de prompt NO sirve: Haiku 4.5 solo cachea desde 4096 tokens y el prompt es más corto.
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
   dólar tarjeta del vencimiento. Pantalla `/medios/[id]`: abre en el resumen a pagar (o el abierto).
   Se marca como **pagado** (pago completo, no parcial; no se registra como gasto, decisión de
   Felipe) y muestra **en qué cuota va** cada compra en cuotas y cuánto queda.
   En la demo, la Visa tiene cierre 25 y vencimiento 7 (la Mastercard, sin configurar).
3. **Gastos fijos** — falta empezar. Se cargan solos cada mes (al abrir Inicio o Gastos), con un
   **solo aviso** que lista todos los cargados. Tabla `recurring_expenses`, `recurringId` en cada
   gasto (único por día, para no duplicar), página `/fijos`. Editables a mano; al cambiar el monto:
   "¿desde este mes o desde el próximo?". Los fijos en USD guardan su tipo de dólar.

**Al retomar (sesión del 2026-09-26):** seguir con la etapa 3. En la demo, el resumen de
septiembre de la Visa quedó marcado como pagado con fecha 11/09 (de una prueba, antes de agregar
la validación "no antes del cierre"): se puede desmarcar desde la pantalla.

**Para cuando esté la API key (todo lo de Chop):**
- Al cargar un gasto en USD, que Chop pregunte "¿Qué dólar usaste?" (hoy el servicio pone
  Tarjeta si es crédito y MEP si no).
- Aviso por WhatsApp de los gastos fijos cargados, en un solo mensaje (ventana de 24 h de Meta).
- Decirle a Chop que un fijo aumentó ("Netflix aumentó a 12.000") → ¿desde este mes o el próximo?
- Resumen de la tarjeta por Chop ("¿cuánto me viene en la Visa?").
- Totales de Chop en pesos (hoy `sendSummary` en `menu.ts` dice "$ X + USD Y").

## Pendientes chicos

- **Docker sin sudo:** el usuario `laptop` no está en el grupo `docker`, así que `npm run db:up`
  falla. Arreglo: `sudo usermod -aG docker laptop` y volver a iniciar sesión.
- `npm run db:seed` **pisa la contraseña del admin** con la del `.env`. Felipe decidió no tocarlo por
  ahora (no hay datos importantes), pero no hay que correrlo en el servidor con datos reales.
- No hay tests automáticos: las pruebas de esta sesión se hicieron con scripts temporales.
