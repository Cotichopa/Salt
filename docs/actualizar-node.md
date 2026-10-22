# Actualizar Node en el servidor (pendiente desde el 2026-10-22)

El 21 de octubre de 2026 Node.js sacó parches urgentes (10 fallas; la más grave, CVE-2026-111497, en
la descompresión Brotli, se dispara con un `fetch()` a un servidor que contesta comprimido así, y Salt
hace `fetch` a Meta, Anthropic y la API del dólar). Versiones arregladas: **22.23.4**, 24.22.1 y 26.12.1.
Node 18, 20, 21, 23 y 25 ya no reciben arreglos.

El servidor tiene el Node que trae Debian 13 (**20.19**, ver `deploy/install.sh`), así que hay que
pasarlo a **Node 22** (el mismo de las compus de desarrollo).

PHP también sacó parches ese día (8.5.12, 8.4.27, 8.3.36, 8.2.35), y ya lo están atacando. Salt no usa
PHP, pero si la otra app de la VM o alguna máquina de la casa (la del nginx) lo usa, hay que actualizarla
y reiniciar PHP-FPM o Apache.

## Pasos en la VM

Con el usuario de la app (el mismo que corre `deploy/update.sh`), desde la carpeta de Salt:

```
node -v                          # si ya dice v22.23.4 o más, no hace falta seguir
npm run db:backup                # copia de la base por las dudas

# 1. Mirar si Debian ya trajo un arreglo (a veces lo hace para Node 20)
sudo apt update && apt list --upgradable 2>/dev/null | grep -i node

# 2. Pasar a Node 22 con el repositorio de NodeSource
sudo apt remove -y npm           # el npm de Debian choca con el de NodeSource (que trae el suyo)
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
less /tmp/nodesource_setup.sh    # mirarlo antes de correrlo
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node -v                          # tiene que decir v22.23.4 o más

# 3. Reinstalar las dependencias con el Node nuevo (sharp y otras tienen partes compiladas) y armar
npm ci
npm run build
sudo systemctl restart salt
systemctl status salt            # tiene que decir "active (running)"
```

## Probar

- Entrar a https://salt.estilo.ar (con contraseña y con huella).
- Mandarle "hola" a Chop por WhatsApp y una foto de un ticket.
- Un audio (Whisper no depende de Node, pero ffmpeg sí corre desde Node).
- `npm run check` (el chequeo diario) no tiene que mandar ningún aviso nuevo.

## Después

- Cambiar `deploy/install.sh` (paso 1/7): hoy instala el `nodejs` y el `npm` de Debian. Tiene que agregar
  el repositorio de NodeSource y no instalar el paquete `npm`; si no, una instalación nueva vuelve a Node 20.
- Las librerías de Salt también tienen avisos (`npm audit`): `npm audit fix` para los que no cambian nada
  grande, y aparte pasar `pdfjs-dist` a la versión 6 (aviso de JavaScript al abrir un PDF malicioso; lee
  los PDF de los tickets) probando los PDF por Chop y en el visor.
- Borrar este archivo y su línea en `docs/estado.md` cuando esté hecho.
