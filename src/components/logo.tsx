// Ánfora romana: la vasija con la que se comerciaba la sal, de donde viene el nombre.
// Toma el color del texto que la rodea (currentColor), así funciona en claro y en oscuro.

type Props = React.SVGProps<SVGSVGElement> & { variant?: "outline" | "solid" };

export function Logo({ variant = "outline", ...props }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Salt"
      width="1em"
      height="1em"
      {...props}
    >
      {variant === "solid" ? (
        <>
          <path
            fill="currentColor"
            d="M11.5 4h9v2.2h-1.3v2.1l4.3 6-7.5 13.8-7.5-13.8 4.3-6V6.2H11.5z"
          />
          <path
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m13.4 6.8-3.8 2 .4 4.4m8.6-6.4 3.8 2-.4 4.4"
          />
        </>
      ) : (
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11.5 5h9" />
          <path d="M13.5 5v3.5" />
          <path d="M18.5 5v3.5" />
          <path d="M13.5 6.6 9.8 8.6l.4 4.4" />
          <path d="m18.5 6.6 3.7 2-.4 4.4" />
          <path d="M13.5 8.5 9.4 14.3 16 26.4l6.6-12.1-4.1-5.8" />
          <path d="M16 26.4v2.2" />
          <path d="M13.8 28.6h4.4" />
        </g>
      )}
    </svg>
  );
}
