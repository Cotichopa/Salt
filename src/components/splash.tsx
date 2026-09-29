// Animación al abrir Salt desde el ícono instalado en el celular (~2 s). Arranca igual que la
// pantalla de carga de Android (el ánfora de líneas sobre negro, el ícono de la app), así el paso
// no se nota: el ánfora se llena de sal de abajo hacia arriba, aparece "Salt" y todo se desvanece
// hacia la app.
//
// El script corre ANTES de que se pinte la página: si la app está instalada (display-mode
// standalone) y es la primera página de esta apertura, le pone la clase "splash" al <html> y el
// CSS (globals.css) muestra la animación. En el navegador común o al navegar adentro no aparece.

const script = `try{if(matchMedia("(display-mode: standalone)").matches&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!sessionStorage.getItem("salt-splash")){sessionStorage.setItem("salt-splash","1");document.documentElement.classList.add("splash")}}catch(e){}`;

// Los trazos del ánfora (los mismos del logo y del ícono de la app)
const strokes = [
  "M11.5 5h9",
  "M13.5 5v3.5",
  "M18.5 5v3.5",
  "M13.5 6.6 9.8 8.6l.4 4.4",
  "m18.5 6.6 3.7 2-.4 4.4",
  "M13.5 8.5 9.4 14.3 16 26.4l6.6-12.1-4.1-5.8",
  "M16 26.4v2.2",
  "M13.8 28.6h4.4",
];
// El interior (cuello y cuerpo): la sal lo llena
const inside = "M13.5 5h5v3.5l4.1 5.8L16 26.4 9.4 14.3l4.1-5.8z";

export function Splash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <div className="splash-screen" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" className="size-28">
          <defs>
            <clipPath id="splash-inside">
              <path d={inside} />
            </clipPath>
          </defs>
          {/* La sal: un rectángulo que sube, recortado con la forma del ánfora */}
          <g clipPath="url(#splash-inside)">
            <rect className="splash-salt" x="0" y="0" width="32" height="32" fill="currentColor" />
          </g>
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {strokes.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </svg>
        <span className="splash-word font-display">Salt</span>
      </div>
    </>
  );
}
