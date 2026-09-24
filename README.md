# 🧂 Salt — gastos familiares por web y WhatsApp

Cada integrante de la familia carga sus gastos desde el portal web o escribiéndole a **Chop**, el bot de
WhatsApp, y ve sus propios gastos, totales y gráficos. Nadie ve los gastos del resto.

```
  Navegador ──────────┐
                      ├──► Next.js ──► servicios ──► Prisma ──► PostgreSQL
  WhatsApp ──► Meta ──┘   (web + API)  (una sola     (ORM)      (Docker)
                                        lógica)
                            │
                            └──► Claude Haiku (interpreta los mensajes libres)
```

La regla de oro del proyecto: **la web y el bot usan el mismo código** para crear, consultar y borrar
gastos (`src/lib/services/`). Nada se implementa dos veces, y las reglas de seguridad valen para los dos.

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
| `npm run db:migrate` | Aplica cambios del esquema y regenera el cliente de Prisma. **Después hay que reiniciar `npm run dev`**: el servidor se queda con el cliente viejo en memoria |
| `npm run db:seed` | Carga categorías base y la cuenta admin |
| `npm run db:demo` | Crea (o recrea) la cuenta demo@salt.local con un año de gastos de ejemplo. Muestra la contraseña en la terminal |
| `npm run db:studio` | Visor de las tablas en el navegador |
| `npm run lint` | Revisa el código |
| `npm run tunnel` | Expone el puerto 3001 en internet (ngrok) |

El archivo `.env` (que **no** va a git) tiene las claves. `.env.example` es la plantilla con todas las
variables que hay que completar.

> **Si cambiás `prisma/schema.prisma`:** corré `npm run db:migrate` y **reiniciá `npm run dev`**.
> El servidor se queda con el cliente viejo en memoria y da errores del tipo
> "Cannot read properties of undefined".

---

## Tecnologías

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 16** (App Router) + TypeScript | Web, backend y webhook en un solo proyecto |
| Estilos | **Tailwind CSS 4** + **shadcn/ui** | Componentes editables, copiados dentro del proyecto |
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
│   ├── (app)/                  Páginas privadas (requieren sesión)
│   │   ├── dashboard/          Indicadores y gráficos  ← charts.tsx
│   │   ├── gastos/             Lista por día / tabla, filtros, buscador, alta y edición
│   │   ├── categorias/         Categorías propias y pantalla de cada una ([id])
│   │   ├── medios/             Tarjetas y billeteras propias
│   │   ├── cuenta/             Cambiar la contraseña
│   │   ├── admin/usuarios/     Alta y administración de cuentas (solo admin)
│   │   └── layout.tsx          Encabezado y navegación
│   ├── login/                  Pantalla de ingreso (panel de marca partido)
│   ├── api/whatsapp/route.ts   Webhook: acá llegan los mensajes de Meta
│   ├── icon.svg                Ícono de la pestaña (ánfora)
│   ├── globals.css             ← COLORES Y ESTILOS GENERALES
│   └── layout.tsx              Fuentes, idioma, título, tema
├── components/
│   ├── ui/                     Componentes de shadcn (editables)
│   ├── logo.tsx                El ánfora (contorno y sólida)
│   └── theme-toggle.tsx        Interruptor claro/oscuro
├── lib/
│   ├── services/               Lógica compartida (web + WhatsApp)
│   │   ├── expenses.ts         Crear (con cuotas), listar, editar y borrar gastos
│   │   ├── categories.ts       Categorías base y propias
│   │   ├── payment-sources.ts  Tarjetas y billeteras
│   │   └── stats.ts            Números del dashboard
│   ├── actions/                Puente entre los formularios y los servicios
│   ├── whatsapp/
│   │   ├── bot.ts              Comandos globales (menu, cancelar, borrar último)
│   │   ├── menu.ts             Menú paso a paso (máquina de estados) y textos
│   │   ├── ai-parser.ts        Instrucciones para la IA: intención + datos
│   │   ├── client.ts           Envío de mensajes, botones y listas
│   │   ├── session.ts          En qué paso está cada conversación
│   │   └── webhook.ts          Verificación de la firma de Meta
│   ├── db.ts                   Conexión única a la base
│   ├── dal.ts                  requireUser() y requireAdmin()
│   ├── session.ts              Cookie firmada
│   ├── validators.ts           Reglas de validación (zod)
│   ├── format.ts               Montos, fechas y etiquetas en español
│   └── text.ts                 Normalizar texto (sin tildes, minúsculas)
└── generated/prisma/           Cliente de Prisma (se genera solo, no se edita)

prisma/
├── schema.prisma               Definición de las tablas
├── migrations/                 Historial de cambios de la base
└── seed.ts                     Datos iniciales
```

---

## Base de datos

| Tabla | Guarda |
|---|---|
| `users` | Nombre, email, contraseña (hash), teléfono de WhatsApp, rol (ADMIN/MEMBER), activo |
| `categories` | Nombre, ícono (web), emoji (WhatsApp), palabras clave. Sin usuario = categoría base, compartida |
| `expenses` | Monto (decimal), moneda (ARS/USD), medio de pago, descripción, fecha, origen (WEB/WHATSAPP) |
| `payment_sources` | Tarjetas y billeteras de cada usuario (Visa, Mercado Pago...) |
| `budgets` | Presupuesto mensual en pesos de cada usuario para una categoría (uno por categoría) |
| `wa_sessions` | En qué paso del menú está cada teléfono (expira a los 15 minutos) |

**Reglas que protegen los datos:**
- Todas las consultas filtran por el usuario de la sesión: nadie puede ver ni tocar gastos ajenos.
- Las contraseñas se guardan como hash (bcrypt), nunca en texto.
- Los montos usan `Decimal`, no `Float`, para que no haya errores de redondeo.
- Las fechas guardan solo el día, calculado con la zona horaria de Argentina.
- Borrar una categoría con gastos obliga a moverlos a otra (en una transacción).
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

## El bot de WhatsApp (Chop)

```
Mensaje ──► ¿es un comando? (menu, cancelar, borrar último)
              │ no
              ▼
            ¿hay una conversación en curso? ──► sigue el paso del menú
              │ no
              ▼
            IA (Claude Haiku) ──► ¿qué quiere hacer?
              ├─ cargar    ──► propone el gasto ──► confirmás ──► guardado
              ├─ consultar ──► resumen del período pedido
              ├─ eliminar  ──► busca el gasto ──► confirmás ──► borrado
              ├─ editar    ──► muestra antes/después ──► confirmás ──► cambiado
              └─ no entiende / sin crédito ──► repregunta o muestra el menú
```

- **Menú:** ➕ Cargar gasto (categoría → monto → moneda → medio → descripción → confirmar),
  📊 Consultar (hoy, semana, mes, mes pasado, por categoría) y 🗑️ Eliminar (elegís de los últimos 10).
- **Texto libre:** entiende qué querés hacer, no solo cargar:
  - *cargar*: "ayer gasté 3 lucas en el chino con débito", "zapatillas 120000 en 6 cuotas con la visa"
  - *consultar*: "cuánto gasté en comida este mes", "cuánto llevo en la visa"
  - *eliminar*: "borrá el gasto de la nafta"
  - *editar*: "la nafta eran 18000", "pasalo a efectivo"
  - si le falta un dato, ofrece completarlo; si no entiende, repregunta.
- **Siempre pide confirmación** antes de guardar.
- **Costo de la IA:** ~US$ 0,0035 por mensaje (~US$ 5 por mes con uso familiar). Cada consulta deja
  el costo en la terminal: `[ai-parser] 1099+72 tokens · US$ 0.00146`.
- **Seguridad:** solo responde a teléfonos cargados en Salt, verifica la firma de Meta en cada aviso
  e ignora mensajes repetidos.

Los textos del bot están en `src/lib/whatsapp/menu.ts` y `bot.ts`; las reglas de interpretación, en la
constante `SYSTEM` de `ai-parser.ts`.

---

## 🎨 Dónde tocar la estética

Todo el aspecto visual sale de **variables de color** definidas en `src/app/globals.css`. Cambiando
esas variables cambia toda la app de una, sin tocar las páginas.

### 1. Colores generales — `src/app/globals.css`

En el bloque `:root` (modo claro) y `.dark` (modo oscuro):

| Variable | Qué pinta |
|---|---|
| `--background` / `--foreground` | Fondo y texto de la página |
| `--card` / `--card-foreground` | Fondo y texto de las tarjetas |
| `--primary` / `--primary-foreground` | Botones principales |
| `--secondary`, `--muted`, `--accent` | Botones suaves, textos grises, resaltados |
| `--destructive` | Rojo de eliminar |
| `--border`, `--input`, `--ring` | Bordes, campos y el aro al enfocar |
| `--radius` | Qué tan redondeadas son las esquinas (hoy `0.625rem`) |
| `--chart-1` … `--chart-5` | Colores de los gráficos |

Los colores están en formato **oklch** (claridad, saturación, tono), pero también acepta hex común
(`#2a78d6`). Para probar paletas enteras: **tweakcn.com** o **ui.shadcn.com/themes** generan estos
bloques listos para pegar.

> Los colores de los gráficos están validados para daltonismo. Si los cambiás, conviene mantener
> tonos bien distintos entre sí.

### 2. Tipografía — `src/app/layout.tsx`

Hoy usa **Geist**. Para cambiarla, se importa otra de `next/font/google`:

```ts
import { Inter } from "next/font/google";
const geistSans = Inter({ variable: "--font-geist-sans", subsets: ["latin"] });
```

### 3. Componentes — `src/components/ui/`

Son de shadcn, pero el código es tuyo: están copiados en el proyecto y se pueden editar. Por ejemplo,
en `button.tsx` están los tamaños y las variantes (`default`, `outline`, `ghost`, `destructive`).

Para sumar componentes nuevos (pestañas, avatares, menús laterales):

```bash
npx shadcn@latest add tabs avatar sidebar
```

### 4. Modo oscuro

Las variables del modo oscuro ya están definidas en `.dark`, pero **falta el botón para activarlo**.
Se agrega instalando `next-themes` (ya viene como dependencia de sonner) y un interruptor en el
encabezado. Es un rato de trabajo, si lo querés lo hacemos.

### 5. Páginas donde toquetear el diseño

| Archivo | Qué contiene |
|---|---|
| `src/app/(app)/layout.tsx` | Encabezado, navegación, ancho máximo del contenido |
| `src/app/(app)/dashboard/page.tsx` | Tarjetas de indicadores y distribución de los gráficos |
| `src/app/(app)/dashboard/charts.tsx` | Alto, colores y formato de cada gráfico |
| `src/app/(app)/gastos/expenses-view.tsx` | Lista por día (celular), tabla (escritorio), buscador y exportación |
| `src/components/logo.tsx` | El ánfora del logo |
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
| 5 | Categorías propias con emoji y palabras clave | ✅ |
| 6 | Dashboard con indicadores y gráficos | ✅ |
| 7 | Webhook de WhatsApp con verificación de firma | ✅ |
| 8 | Menú paso a paso del bot | ✅ |
| 9 | Texto libre interpretado con IA | ✅ |
| 10 | Despliegue en servidor propio | ⏳ pendiente |
| 11 | Transcripción de audios (opcional) | 💡 idea |

**Además de las etapas, ya está hecho:**
- Rediseño monocromático (blanco y negro), tipografías Bricolage Grotesque e Instrument Sans,
  logo de ánfora romana y modo claro/oscuro con interruptor.
- Inicio con saludo de Chop (un dato del mes o un aviso de presupuesto), cuatro indicadores (total, proyección a fin de mes, gasto promedio y el más grande),
  torta de categorías con detalle al tocar, acumulado contra el mes pasado, gasto por día y por día
  de la semana.
- Gastos: lista agrupada por día en el celular, tabla en escritorio, paginada de a 15 (con la
  página en la URL). El buscador busca en todo el historial: texto sin importar tildes ni errores
  de tipeo, montos ("15.000") y fechas ("24/09", "septiembre 2025") — ver `src/lib/expense-search.ts`.
  Exportar a CSV baja todo lo filtrado. La carga manual está solo en Gastos: en el resto de la app
  se carga con Chop.
- Tarjetas y billeteras propias, compras en cuotas y desglose por tarjeta en el inicio.
- Menú hamburguesa en el celular (panel lateral con todas las secciones).
- Categorías con íconos en blanco y negro (el emoji queda para Chop en WhatsApp) y una pantalla
  por categoría con lo gastado en la semana, el mes y el año, historial y sus gastos.
- Presupuesto mensual por categoría: barra de progreso en la categoría, en la lista y en el inicio;
  aviso al llegar al 80 % y al pasarse (en la web al cargar y en la respuesta de Chop), y Chop
  responde "¿cuánto me queda del presupuesto de...?".
- Chop dentro de la app: botón flotante con su cara de beagle (`public/chop.png`, `src/components/chop/`) que abre el
  chat, en una ventanita en la compu y a pantalla completa en el celular. Mismo cerebro que WhatsApp (`handleInput` en
  `src/lib/whatsapp/bot.ts`), con sus botones y listas. Las respuestas salen por una "salida"
  intercambiable (`outbox.ts`). Tiene botón para grabar audio: la transcripción todavía no está
  conectada (`src/lib/transcribe.ts`, pensado para Whisper).
- Chop entiende intenciones (cargar, consultar, eliminar, editar), pide los datos que faltan,
  acepta correcciones y repregunta cuando no entiende.

**Ideas para más adelante:** gastos recurrentes (alquiler,
Netflix), foto de ticket, transcripción de audios, varias monedas con cotización del día,
papelera para recuperar gastos borrados, invitación por WhatsApp con link `wa.me`, número de versión
visible en la app.

---

## Antes de desplegar

- [ ] Cambiar el token temporal de WhatsApp por uno **permanente** (usuario del sistema en Meta).
- [ ] Generar contraseñas nuevas para el `.env` del servidor (no reusar las locales).
- [ ] Apuntar el webhook de Meta al dominio definitivo.
- [ ] **La cuenta de WhatsApp Business (WABA) tiene que estar suscripta a la app** en Meta: no alcanza
      con configurar el webhook. Sin eso, los mensajes no llegan nunca.
- [ ] Definir copias de seguridad de la base de datos (hoy no hay ninguna, y los borrados son definitivos).
- [ ] Poner el proyecto en una versión (`package.json` dice 0.1.0) y etiquetarla en git (`git tag v1.0.0`).
- [ ] Revisar el límite de gasto de la API de Anthropic y que el crédito alcance.
