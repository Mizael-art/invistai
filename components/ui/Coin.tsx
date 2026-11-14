const COLORS: Record<string, string> = { BTC: "#f7931a", ETH: "#7b8ff0", SOL: "#14c98a", BNB: "#f0b90b", XRP: "#9aa5b1", USDT: "#26a17b", USDC: "#4a90e2", DOGE: "#c2a633", ADA: "#4f7cff", TRX: "#ff4d5e" };
/** Avatar do ativo: inicial na cor do ativo sobre fundo tingido (sem logotipos de terceiros). */
export function Coin({ symbol }: { symbol: string }) {
  return <i className="coin" style={{ ["--c" as string]: COLORS[symbol] ?? "#87948B" }} aria-hidden="true">{symbol.slice(0, 1)}</i>;
}
