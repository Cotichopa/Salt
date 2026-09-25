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
2. **Bajar el consumo de tokens de Chop.** Medir primero con el log `[ai-parser] X+Y tokens`.
   Ideas, de mayor a menor impacto: pre-filtro sin IA para mensajes simples ("nafta 15000") usando
   las palabras clave; esquema de respuesta más corto (hoy devuelve todos los campos aunque no
   apliquen); prompt más compacto; caché de prompt (verificar el mínimo de tokens del modelo).
3. **Audios con Whisper.** Solo hay que implementar `src/lib/transcribe.ts`. Se decide según el
   servidor: sin placa de video conviene Whisper por API; local solo si el servidor tiene GPU o
   CPU de sobra. Falta también descargar el audio de Meta (llega como id, formato OGG/Opus).
4. **Subir al servidor** (todavía no está definido cuál). Ver "Antes de desplegar" en el README;
   lo más importante: backups de la base, dominio con HTTPS, número real de WhatsApp.

## Pendientes chicos

- `npm run db:seed` **pisa la contraseña del admin** con la del `.env`. Felipe decidió no tocarlo por
  ahora (no hay datos importantes), pero no hay que correrlo en el servidor con datos reales.
- No hay tests automáticos: las pruebas de esta sesión se hicieron con scripts temporales.
