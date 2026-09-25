# 🧂 Salt — gastos familiares por web y WhatsApp

Cada integrante de la familia carga y consulta sus gastos hablando con **Chop** (un beagle inglés que
atiende por WhatsApp y dentro de la app) o desde el portal web, y ve sus propios totales, presupuestos
y gráficos. Nadie ve los gastos del resto.

```
  Navegador ──────────┐
                      ├──► Next.js ──► servicios ──► Prisma ──► PostgreSQL
  WhatsApp ──► Meta ──┘   (web + API)  (una sola     (ORM)      (Docker)
                                        lógica)
                            │
                            └──► Claude Haiku (interpreta los mensajes libres de Chop)
```

La regla de oro del proyecto: **nada se implementa dos veces**. La web y Chop usan los mismos servicios
para crear, consultar y borrar gastos (`src/lib/services/`), y Chop tiene un solo "cerebro" para
WhatsApp y para el chat de la web (`handleInput` en `src/lib/whatsapp/bot.ts`). Las reglas de
seguridad valen para todos.

---

## Arrancar el proyecto

```bash
npm run db:up      # levanta PostgreSQL en Docker
npm run dev        # http://localhost:3001
npm run tunnel     # (opcional) túnel público para que Meta llegue al webhook
```

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo (puerto 3001) |
| `npm run build` | Compila para producción |
| `npm run db:up` / `db:down` | Prende / apaga la base de datos |
| `npm run db:migrate` | Aplica cambios del esquema y regenera el cliente de Prisma. **Después hay que reiniciar `npm run dev`** |
| `npm run db:seed` | Crea la cuenta admin y les carga las categorías, tarjetas y billeteras iniciales a las cuentas que no tienen. ⚠️ **Resetea la contraseña del admin** a la del `.env` |
| `npm run db:demo` | Crea (o recrea) la cuenta `demo@salt.local` con un año de gastos de ejemplo. Muestra la contraseña en la terminal |
| `npm run db:studio` | Visor de las tablas en el navegador |
| `npm run lint` | Revisa el código |
| `npm run tunnel` | Expone el puerto 3001 en internet (ngrok) |

El archivo `.env` (que **no** va a git) tiene las claves. `.env.example` es la plantilla con todas las
variables que hay que completar.

> **Si cambiás `prisma/schema.prisma`:** corré `npm run db:migrate` y **reiniciá `npm run dev`**.
> El servidor se queda con el cliente viejo en memoria y da errores del tipo
> "Cannot read properties of undefined".

> **Para arreglar datos a mano** (por ejemplo, cambiar algo de las categorías de una cuenta) conviene un
> `UPDATE` directo con `npx prisma db execute --stdin` en vez de volver a correr el seed, que pisa la
> contraseña del admin.

**En otra compu** (después de `git pull`): `npm install`, `npm run db:up`, `npm run db:migrate`,
`npm run db:seed` y `npm run dev`.

---

## Tecnologías

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 16** (App Router) + TypeScript | Web, backend y webhook en un solo proyecto |
| Estilos | **Tailwind CSS 4** + **shadcn/ui** (sobre Base UI) | Componentes editables, copiados dentro del proyecto |
| Íconos | **lucide-react** | Íconos de línea, del mismo estilo que el logo |
| Gráficos | **Recharts** (vía shadcn `chart`) | Integrado con los componentes |
| Base de datos | **PostgreSQL 17** en Docker | Igual en desarrollo y en producción |
| ORM | **Prisma 7** | Consultas en TypeScript, migraciones versionadas, permite cambiar de motor |
| Sesiones | **jose** (JWT en cookie) + capa de acceso propia | Lo que recomienda la documentación de Next.js |
| Validación | **zod** | Las mismas reglas para la web y para WhatsApp |
| WhatsApp | **Meta WhatsApp Cloud API** | Número de prueba gratuito |
| IA | **Claude Haiku 4.5** (`@anthropic-ai/sdk`) | Interpreta mensajes escritos en lenguaje natural |

---

## Mapa del proyecto

```
src/
├── app/
│   ├── (app)/                   Páginas privadas (requieren sesión)
│   │   ├── dashboard/           Inicio: saludo de Chop, indicadores, presupuestos, gráficos ← charts.tsx
│   │   ├── gastos/              Lista paginada, filtros, buscador, alta y edición
│   │   │   ├── query.ts         Filtros de la URL → gastos (lo comparten la página y Exportar)
│   │   │   ├── expense-list.tsx Lista por día (celular) / tabla (compu) + ventana de edición
│   │   │   └── exportar/        GET /gastos/exportar: descarga el CSV de todo lo filtrado
│   │   ├── categorias/          Lista de categorías
│   │   │   └── [id]/            Pantalla de una categoría: semana/mes/año, presupuesto, historial
│   │   ├── medios/              Tarjetas y billeteras propias
│   │   ├── cuenta/              Cambiar la contraseña
│   │   ├── admin/usuarios/      Alta y administración de cuentas (solo admin)
│   │   └── layout.tsx           Encabezado, navegación y botón de Chop
│   ├── login/                   Pantalla de ingreso (panel de marca partido)
│   ├── api/whatsapp/route.ts    Webhook: acá llegan los mensajes de Meta
│   ├── icon.svg                 Ícono de la pestaña (ánfora)
│   ├── globals.css              ← COLORES Y ESTILOS GENERALES
│   └── layout.tsx               Fuentes, idioma, título, tema
├── components/
│   ├── ui/                      Componentes de shadcn (editables)
│   ├── chop/                    Chop en la app: botón flotante, chat y avatar
│   ├── main-nav.tsx             Menú: fila de links (compu) y hamburguesa (celular)
│   ├── category-icon.tsx        Catálogo de íconos de categorías (y su emoji gemelo para WhatsApp)
│   ├── budget-bar.tsx           Barra de progreso de un presupuesto
│   ├── pagination.tsx           Paginado con números
│   ├── chart-data-table.tsx     Tabla "Ver datos" debajo de los gráficos
│   ├── logo.tsx                 El ánfora (contorno y sólida)
│   └── theme-toggle.tsx         Interruptor claro/oscuro
├── lib/
│   ├── services/                Lógica compartida (web + Chop)
│   │   ├── expenses.ts          Crear (con cuotas), listar, editar y borrar gastos
│   │   ├── categories.ts        Categorías de cada cuenta (y las iniciales)
│   │   ├── budgets.ts           Presupuestos y avisos del 80 % / 100 %
│   │   ├── category-stats.ts    Números de la pantalla de una categoría
│   │   ├── payment-sources.ts   Tarjetas y billeteras
│   │   └── stats.ts             Números del inicio
│   ├── actions/                 Puente entre los formularios y los servicios (chop.ts = chat web)
│   ├── whatsapp/                Chop
│   │   ├── bot.ts               Entrada de WhatsApp + handleInput (el cerebro, también para la web)
│   │   ├── menu.ts              Menú paso a paso (máquina de estados) y textos
│   │   ├── ai-parser.ts         Instrucciones para la IA: intención + datos
│   │   ├── outbox.ts            Por dónde salen las respuestas: WhatsApp o el chat de la web
│   │   ├── client.ts            Envío de mensajes, botones y listas por WhatsApp
│   │   ├── session.ts           En qué paso está cada conversación
│   │   └── webhook.ts           Verificación de la firma de Meta
│   ├── expense-search.ts        Buscador de gastos (texto con errores, montos, fechas)
│   ├── csv.ts                   Gastos → CSV para Excel
│   ├── transcribe.ts            Audio → texto (todavía sin conectar, pensado para Whisper)
│   ├── db.ts                    Conexión única a la base
│   ├── dal.ts                   requireUser() y requireAdmin()
│   ├── session.ts               Cookie firmada
│   ├── validators.ts            Reglas de validación (zod)
│   ├── format.ts                Montos, fechas y etiquetas en español
│   └── text.ts                  Normalizar texto (sin tildes, minúsculas)
└── generated/prisma/            Cliente de Prisma (se genera solo, no se edita)

prisma/
├── schema.prisma                Definición de las tablas
├── migrations/                  Historial de cambios de la base
├── seed.ts                      Datos iniciales (admin y sus categorías y medios de pago)
└── demo.ts                      Cuenta demo con un año de gastos

public/
└── chop.png                     La cara de Chop (beagle en grises)
```

---

## Base de datos

| Tabla | Guarda |
|---|---|
| `users` | Nombre, email, contraseña (hash), teléfono de WhatsApp, rol (ADMIN/MEMBER), activo |
| `categories` | Nombre, ícono (web), emoji (WhatsApp), palabras clave. Cada cuenta tiene las suyas: las iniciales se copian al crearla |
| `expenses` | Monto (decimal), moneda (ARS/USD), medio de pago, tarjeta, descripción, fecha, cuota, origen (WEB/WHATSAPP) |
| `payment_sources` | Tarjetas y billeteras de cada usuario (Visa, Mercado Pago...) |
| `budgets` | Presupuesto mensual en pesos de cada usuario para una categoría (uno por categoría) |
| `wa_sessions` | En qué paso del menú está cada conversación (el teléfono, o `web:<usuario>` en el chat de la web). Expira a los 15 minutos |

**Reglas que protegen los datos:**
- Todas las consultas filtran por el usuario de la sesión: nadie puede ver ni tocar gastos ajenos.
  Las categorías también son de cada cuenta: todas arrancan con las mismas 11, pero editarlas o borrarlas no afecta a nadie más.
- Las contraseñas se guardan como hash (bcrypt), nunca en texto.
- Los montos usan `Decimal`, no `Float`, para que no haya errores de redondeo.
- Las fechas guardan solo el día, calculado con la zona horaria de Argentina.
- Borrar una categoría con gastos obliga a moverlos a otra (en una transacción). Su presupuesto se borra con ella.
- Borrar un usuario borra sus gastos; una categoría con gastos no se puede borrar.
- Borrar una tarjeta NO borra los gastos: quedan sin tarjeta.
- Una compra en cuotas son varios gastos con el mismo `purchaseId`, uno por mes.

---

## Cómo funciona la sesión

```
Login ──► valida con bcrypt ──► cookie firmada (JWT, httpOnly, 30 días)
                                        │
        ┌───────────────────────────────┴──────────────────────────┐
   src/proxy.ts                                            src/lib/dal.ts
   Filtro rápido antes de cada página                      Verificación real contra la base
   (solo revisa la firma)                                  (¿existe?, ¿está activo?, ¿es admin?)
```

Cada página y cada acción del servidor verifica permisos por su cuenta: esconder un botón no alcanza.

---

## Chop, el bot

Chop atiende por **dos canales con el mismo cerebro**:

```
WhatsApp ──► webhook ──► handleMessage (identifica por teléfono) ─┐
                                                                  ├──► handleInput ──► ctx.out
Botón de Chop en la web ──► acción talkToChop (usuario logueado) ─┘      (el cerebro)   (outbox.ts)
                                                                                           │
                                                           WhatsApp: manda el mensaje ◄────┤
                                                           Web: lo devuelve al chat   ◄────┘
```

Dentro de `handleInput`:

```
Mensaje ──► ¿es un comando? (menu, cancelar, borrar último)
              │ no
              ▼
            ¿hay una conversación en curso? ──► sigue el paso del menú
              │ no
              ▼
            IA (Claude Haiku) ──► ¿qué quiere hacer?
              ├─ cargar    ──► propone el gasto ──► confirmás ──► guardado (+ aviso de presupuesto)
              ├─ consultar ──► resumen del período pedido (+ presupuestos si es el mes en curso)
              ├─ eliminar  ──► busca el gasto ──► confirmás ──► borrado
              ├─ editar    ──► muestra antes/después ──► confirmás ──► cambiado
              └─ no entiende / sin crédito ──► repregunta o muestra el menú
```

- **Menú:** ➕ Cargar gasto (categoría → monto → moneda → medio → descripción → confirmar),
  📊 Consultar (hoy, semana, mes, mes pasado, por categoría) y 🗑️ Eliminar (elegís de los últimos 10).
- **Texto libre:** entiende qué querés hacer, no solo cargar:
  - *cargar*: "ayer gasté 3 lucas en el chino con débito", "zapatillas 120000 en 6 cuotas con la visa"
  - *consultar*: "cuánto gasté en comida este mes", "cuánto me queda del presupuesto de salidas"
  - *eliminar*: "borrá el gasto de la nafta"
  - *editar*: "la nafta eran 18000", "pasalo a efectivo"
  - si le falta un dato, ofrece completarlo; si no entiende, repregunta.
- **Siempre pide confirmación** antes de guardar.
- **Presupuestos:** al guardar un gasto que cruza el 80 % o el 100 % del presupuesto de su
  categoría, lo avisa (una sola vez por umbral).
- **En la web:** botón flotante con la cara de Chop en todas las pantallas. Ventanita en la compu,
  pantalla completa en el celular. Los botones y listas de WhatsApp se muestran como opciones para
  tocar. El historial se guarda en el navegador. Los gastos cargados ahí quedan con origen WEB.
- **Audios:** el chat de la web ya graba (hasta 1 minuto), pero la transcripción no está conectada:
  Chop responde que todavía no entiende audios. Para sumarla, se completa `transcribeAudio` en
  `src/lib/transcribe.ts` (por ejemplo, con Whisper).
- **Costo de la IA:** ~US$ 0,0035 por mensaje (~US$ 5 por mes con uso familiar). Cada consulta deja
  el costo en la terminal: `[ai-parser] 1099+72 tokens · US$ 0.00146`.
- **Seguridad:** por WhatsApp solo responde a teléfonos cargados en Salt, verifica la firma de Meta en
  cada aviso e ignora mensajes repetidos. En la web, usa la sesión del usuario logueado.

Los textos de Chop están en `src/lib/whatsapp/menu.ts` y `bot.ts`; las reglas de interpretación, en la
constante `SYSTEM` de `ai-parser.ts`.

> **Si Chop no contesta por WhatsApp:** casi siempre es el token de Meta vencido (el temporal dura
> 24 horas). Los mensajes llegan, pero Meta rechaza la respuesta con un error 401 que se ve en la
> terminal de `npm run dev`. Se genera uno nuevo en developers.facebook.com → WhatsApp →
> Configuración de la API, se pega en `WHATSAPP_TOKEN` del `.env` y se reinicia el servidor.

---

## 🎨 Dónde tocar la estética

La app es **monocromática** (blanco y negro, con grises). El color queda para lo que comunica algo:
los gráficos y los avisos (ámbar = queda poco, rojo = te pasaste, siempre acompañados de texto).

### 1. Colores generales — `src/app/globals.css`

En el bloque `:root` (modo claro) y `.dark` (modo oscuro):

| Variable | Qué pinta |
|---|---|
| `--background` / `--foreground` | Fondo y texto de la página |
| `--card` / `--card-foreground` | Fondo y texto de las tarjetas |
| `--primary` / `--primary-foreground` | Botones principales (negro en claro, blanco en oscuro) |
| `--secondary`, `--muted`, `--accent` | Botones suaves, textos grises, resaltados |
| `--destructive` | Rojo de eliminar |
| `--border`, `--input`, `--ring` | Bordes, campos y el aro al enfocar |
| `--radius` | Qué tan redondeadas son las esquinas (hoy `0.5rem`) |
| `--chart-1` … `--chart-7` | Colores de los gráficos |

Los colores están en hex (`#0d0d0d`). Para probar paletas enteras: **tweakcn.com** o
**ui.shadcn.com/themes** generan estos bloques listos para pegar.

> Los colores de los gráficos están validados para daltonismo. Si los cambiás, conviene mantener
> tonos bien distintos entre sí.

### 2. Tipografía — `src/app/layout.tsx`

Dos fuentes de `next/font/google`: **Bricolage Grotesque** para la marca y los títulos
(`font-display`) e **Instrument Sans** para leer. Para cambiar una, se importa otra y se reemplaza:

```ts
import { Inter } from "next/font/google";
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
```

### 3. Íconos

- **Categorías:** el catálogo está en `src/components/category-icon.tsx` (58 íconos de lucide, cada
  uno con su emoji gemelo para WhatsApp). Para sumar uno, se agrega una línea con el ícono, el emoji
  y un nombre.
- **Chop:** `public/chop.png` (256×256, fondo transparente, en grises). Se muestra siempre sobre un
  círculo blanco, así el contorno no se pierde en modo oscuro (`src/components/chop/chop-avatar.tsx`).
- **Logo:** el ánfora está dibujada en SVG en `src/components/logo.tsx`.

### 4. Componentes — `src/components/ui/`

Son de shadcn, pero el código es tuyo: están copiados en el proyecto y se pueden editar. Por ejemplo,
en `button.tsx` están los tamaños y las variantes (`default`, `outline`, `ghost`, `destructive`).

Para sumar componentes nuevos:

```bash
npx shadcn@latest add tabs avatar
```

### 5. Páginas donde toquetear el diseño

| Archivo | Qué contiene |
|---|---|
| `src/app/(app)/layout.tsx` | Encabezado, ancho máximo del contenido, botón de Chop |
| `src/components/main-nav.tsx` | Secciones del menú (fila y hamburguesa) |
| `src/app/(app)/dashboard/page.tsx` | Saludo, indicadores, presupuestos y orden de los gráficos |
| `src/app/(app)/dashboard/charts.tsx` | Alto, colores y formato de cada gráfico |
| `src/app/(app)/gastos/expense-list.tsx` | Lista por día (celular) y tabla (escritorio) |
| `src/app/(app)/categorias/[id]/page.tsx` | Pantalla de una categoría |
| `src/components/chop/chop-chat.tsx` | Burbujas, opciones y barra de escritura del chat |
| `src/app/login/page.tsx` | Pantalla de ingreso |

Las clases tipo `flex`, `gap-4`, `text-2xl` son de **Tailwind**: se escriben en el atributo
`className` y cada una hace una cosa (`gap-4` = separación, `text-2xl` = tamaño de texto). Referencia:
tailwindcss.com/docs.

**Consejo:** hacé los cambios con `npm run dev` corriendo, así ves el resultado al instante. Y si
algo se rompe, `git diff` te muestra qué tocaste y `git checkout -- <archivo>` lo deja como estaba.

---

## Estado del proyecto

| Etapa | Qué incluye | Estado |
|---|---|---|
| 1 | Next.js, Tailwind, shadcn/ui, Prisma, PostgreSQL en Docker | ✅ |
| 2 | Tablas, migraciones y datos iniciales | ✅ |
| 3 | Login, sesiones, administración de cuentas | ✅ |
| 4 | Gastos en la web: cargar, listar, editar, borrar, filtrar | ✅ |
| 5 | Categorías propias con ícono y palabras clave | ✅ |
| 6 | Dashboard con indicadores y gráficos | ✅ |
| 7 | Webhook de WhatsApp con verificación de firma | ✅ |
| 8 | Menú paso a paso del bot | ✅ |
| 9 | Texto libre interpretado con IA | ✅ |
| 10 | Despliegue en servidor propio | ⏳ pendiente |
| 11 | Transcripción de audios (Whisper) | 🟡 preparada: el chat graba, falta `transcribe.ts` |

**Además de las etapas, ya está hecho:**
- **Diseño:** monocromático, tipografías Bricolage Grotesque e Instrument Sans, logo de ánfora
  romana, modo claro/oscuro con interruptor y menú hamburguesa en el celular.
- **Inicio:** saludo de Chop (un dato del mes o un aviso de presupuesto), cuatro indicadores (total,
  proyección a fin de mes, gasto promedio y el más grande), presupuestos del mes, torta de
  categorías, acumulado contra el mes pasado, gasto por día y por día de la semana.
- **Gastos:** lista por día en el celular y tabla en la compu, paginada de a 15 (con la página en la
  URL). El buscador busca en todo el historial: texto sin tildes y con errores de tipeo ("carefour"),
  montos ("15.000") y fechas ("24/09", "septiembre 2025"). Exportar baja a CSV todo lo filtrado.
  La carga manual está solo acá; en el resto de la app se carga con Chop.
- **Categorías:** cada cuenta arranca con 11 y las puede editar o borrar (moviendo sus gastos a otra
  o borrándolos con ella) sin afectar a nadie. Íconos en blanco y negro (el emoji queda para
  WhatsApp) y una pantalla por categoría con lo gastado en la semana, el mes y el año, el historial
  y sus gastos.
- **Presupuestos** mensuales por categoría, con barra de progreso y avisos al 80 % y al 100 %.
- **Tarjetas y billeteras** propias, compras en cuotas y desglose por tarjeta en el inicio.
- **Chop** en WhatsApp y dentro de la app (botón flotante con su cara de beagle), con el mismo
  cerebro: entiende intenciones (cargar, consultar, eliminar, editar), pide los datos que faltan,
  acepta correcciones y repregunta cuando no entiende.
- **Cuenta demo** (`npm run db:demo`) para ver la app con un año de datos.

**Ideas para más adelante:** gastos recurrentes (alquiler, Netflix), foto de ticket, varias monedas
con cotización del día, papelera para recuperar gastos borrados, invitación por WhatsApp con link
`wa.me`, historial del chat de Chop guardado en la base (hoy queda en el navegador), número de
versión visible en la app.

---

## Antes de desplegar

- [x] Cambiar el token temporal de WhatsApp por uno **permanente** (usuario del sistema en Meta).
- [ ] Generar contraseñas nuevas para el `.env` del servidor (no reusar las locales).
- [ ] Apuntar el webhook de Meta al dominio definitivo.
- [ ] **La cuenta de WhatsApp Business (WABA) tiene que estar suscripta a la app** en Meta: no alcanza
      con configurar el webhook. Sin eso, los mensajes no llegan nunca.
- [ ] Definir copias de seguridad de la base de datos (hoy no hay ninguna, y los borrados son definitivos).
- [ ] No crear la cuenta demo en el servidor (o borrarla): tiene contraseña simple y datos de mentira.
- [ ] Poner el proyecto en una versión (`package.json` dice 0.1.0) y etiquetarla en git (`git tag v1.0.0`).
- [ ] Revisar el límite de gasto de la API de Anthropic y que el crédito alcance.
- [ ] El chat de la web graba audio: el navegador solo da permiso de micrófono en **HTTPS** (o en
      localhost), así que el servidor tiene que tener certificado.
