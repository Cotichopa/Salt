# Rediseño de la vista en computadora (pendiente)

Pedido de Felipe (2026-10-09): en la compu, el menú y el contenido quedan **muy al medio** y sobran
**espacios en blanco a los costados**. La idea es aprovechar mejor el ancho. En el celular la app
está bien: **no hay que tocarla** (todo lo de acá es para `md:` / `lg:` en adelante).

**Decidido (2026-10-09): menú lateral (opción A).** Para retomarlo: leer este archivo, responder las
preguntas de abajo y recién ahí codear.

## Cómo está hecho hoy

- **`src/app/(app)/layout.tsx`**: el layout de todas las pantallas con sesión. Tres bloques usan
  `mx-auto max-w-5xl` (1024 px centrados):
  - la barra amarilla de "Viendo la cuenta de X" (superadmin en "ver como"),
  - el `<header>` con el logo, el menú (`DesktopNav`), el tema y el menú de la persona,
  - el `<main>` con el contenido (`p-4 pb-24`: el `pb-24` deja lugar al botón de Chop).
- **`src/components/main-nav.tsx`**: `DesktopNav` es una fila de links al lado del logo (se ve desde
  `md:`) y `MobileNav` el ☰ con panel lateral (celular). Los links dependen del rol: `linksFor(role)`
  (Inicio, Gastos, Fijos, Categorías, Tarjetas · + Cuentas para admin · + Resumen para superadmin).
  Con superadmin ya son 7 links: la fila está al límite del ancho.
- **`src/components/chop/chop-widget.tsx`**: el botón flotante de Chop abajo a la derecha, que abre el
  chat en un panel.
- Pantallas con ancho propio más chico: **Mi cuenta** (`cuenta/page.tsx`, `max-w-md`); los diálogos
  (`max-w-lg`). El resto usa todo el `max-w-5xl` con grillas `sm:/md:/lg:grid-cols-*` (11 lugares en
  `src/app/(app)`).
- Login y "olvidé mi contraseña" tienen su propio diseño (`src/components/auth-shell.tsx`): ya ocupan
  toda la pantalla, no entran en este cambio.

## Opciones

**A. Menú lateral fijo — la elegida.** Desde `lg:` el menú pasa a una barra a la izquierda
(~240 px, logo arriba, links con ícono y texto, la persona y el tema abajo), y el contenido ocupa el
resto con un máximo más ancho (`max-w-6xl` o `7xl`). Es el diseño de casi todas las apps de finanzas.
Entran todos los links (también los del superadmin) y el header de arriba desaparece en la compu.
En `md:` (tablets) puede quedar la fila de arriba como hoy, o la barra solo con íconos.

**B. Lo mismo de hoy, más ancho.** Header y contenido de borde a borde (`max-w-none` o `max-w-screen-2xl`
con `px-6 lg:px-10`). Es el cambio más chico (casi solo `layout.tsx`), pero en pantallas grandes las
tablas y las tarjetas quedan muy estiradas: habría que revisar cada pantalla.

**C. Menú lateral + Chop fijo a la derecha.** Como A, pero en pantallas muy anchas (`2xl:`) el chat de
Chop queda abierto en una columna a la derecha en vez de flotante. Usa los costados para algo útil,
pero es lo que más trabajo lleva.

## Preguntas para decidir antes de empezar

1. ~~¿Opción A, B o C?~~ → A, menú lateral.
2. ¿El menú lateral va siempre con texto, o se puede achicar a solo íconos (y que se acuerde)?
3. ¿Desde qué ancho aparece? (`lg:` ≈ 1024 px recomendado; en tablets, `md:`, ¿fila de arriba o barra
   de íconos?)
4. ¿Hasta qué ancho crece el contenido? (`max-w-6xl` ≈ 1150 px, `7xl` ≈ 1280 px, o sin límite)
5. ¿Las pantallas con poco contenido (Mi cuenta) quedan angostas, o se acomodan en 2 columnas?
6. ¿El Inicio aprovecha el ancho con más columnas (indicadores y gráficos lado a lado)?

## Qué revisar al hacerlo

- `layout.tsx`, `main-nav.tsx` (y que `MobileNav` en el celular siga igual).
- El botón de Chop (`chop-widget.tsx`) y el `pb-24` del `<main>`, para que no tape contenido.
- La barra de "ver como" del superadmin, que tiene que seguir viéndose arriba de todo.
- Pantallas a mirar en 1366 px, 1920 px y en el celular: Inicio, Gastos (tabla), Fijos, Categorías y
  su detalle, Tarjetas y el resumen de una tarjeta, Mi cuenta, Cuentas y Resumen (superadmin), en tema
  claro y oscuro.
- Los diálogos, el visor de tickets (`receipt-viewer.tsx`) y la animación de inicio (`splash.tsx`)
  no deberían cambiar.
- Si se usa la guía de diseño (`frontend-design`), pasarle este archivo como contexto.
