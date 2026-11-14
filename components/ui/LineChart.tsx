/** Gráfico de linha em SVG a partir de dados reais (nenhum ponto é inventado). Sem dados suficientes, não desenha nada.
 *  Opcional: rótulos de máximo/mínimo e de início/fim (texto já formatado por quem chama, com a mesma precisão dos dados). */
export function LineChart({ values, label, height = 240, labels }: { values: number[]; label: string; height?: number; labels?: { max?: string; min?: string; start?: string; end?: string } }) {
  if (values.length < 2) return null;
  const step = Math.max(1, Math.floor(values.length / 160)), v = values.filter((_, i) => i % step === 0);
  if (v[v.length - 1] !== values[values.length - 1]) v.push(values[values.length - 1]);   // o último ponto é sempre o valor mais recente
  const min = Math.min(...v), max = Math.max(...v), W = 600, H = height, pad = 10, span = max - min || 1;
  const x = (i: number) => (i / (v.length - 1)) * W, y = (n: number) => H - pad - ((n - min) / span) * (H - pad * 2);
  const pts = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const up = v[v.length - 1] >= v[0], col = up ? "var(--g-tx)" : "var(--rd)", id = `lc${up ? "u" : "d"}`;
  const lx = x(v.length - 1), ly = y(v[v.length - 1]);
  return (<div>
    <div className="chart-wrap">
    <svg className="linechart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".22" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke="var(--bd)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
      <polygon fill={`url(#${id})`} points={`0,${H} ${pts} ${W},${H}`} />
      <polyline fill="none" stroke={col} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={pts} />
      <line x1={lx} x2={lx} y1={ly} y2={H} stroke={col} strokeOpacity=".35" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
    </svg>
    {labels && (labels.max || labels.min) && <div className="chart-ax chart-mm"><span>{labels.max}</span><span>{labels.min}</span></div>}
    </div>
    {labels && (labels.start || labels.end) && <div className="chart-ax"><span>{labels.start}</span><span>{labels.end}</span></div>}
  </div>);
}
export function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const step = Math.max(1, Math.floor(values.length / 30)), v = values.filter((_, i) => i % step === 0);
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((n, i) => `${((i / (v.length - 1)) * 100).toFixed(1)},${(30 - ((n - min) / span) * 26 - 2).toFixed(1)}`).join(" ");
  return (<svg viewBox="0 0 100 30" width="100%" height="30" aria-hidden="true" preserveAspectRatio="none"><polyline fill="none" stroke={up ? "var(--g-tx)" : "var(--rd)"} strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" points={pts} /></svg>);
}
