/** Marca TRADEON: três barras ascendentes inclinadas (mercado em alta) + logotipo "TRADE" com "ON" na cor da marca.
 *  `mark` = só o símbolo. O símbolo é sempre lime (contraste ok nos dois temas). */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (<svg width={size * 1.1} height={size} viewBox="0 0 30 27" aria-hidden="true">
    <path d="M3.2 26h5.6l2.6-9H5.8z" fill="#5FD83A" />
    <path d="M11.2 26h5.6l4-14h-5.6z" fill="#7FEA4C" />
    <path d="M19.2 26h5.6L30 7.5h-5.6z" fill="#9BFF62" />
  </svg>);
}
export function Logo({ mark = false }: { mark?: boolean }) {
  if (mark) return <span className="lg" aria-label="TRADEON"><LogoMark /></span>;
  return (<span className="lg"><LogoMark /><span>TRADE<span className="on-w">ON</span></span></span>);
}
