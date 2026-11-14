/** Marca TRADEON: símbolo (um "T" cuja barra sobe em degrau — leitura de mercado em alta) + logotipo tipográfico.
 *  `mark` = só o símbolo (favicon, espaços pequenos). As cores seguem o tema via CSS (o símbolo é sempre lime com traço Obsidian). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="8" fill="#9BFF62" />
    <path d="M6.5 12.5H11l3-3h7.5M14 9.5v12" fill="none" stroke="#080D0B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>);
}
export function Logo({ mark = false }: { mark?: boolean }) {
  if (mark) return <span className="lg" aria-label="TRADEON"><LogoMark /></span>;
  return (<span className="lg"><LogoMark /><span>TRADE<span className="on-w">ON</span></span></span>);
}
