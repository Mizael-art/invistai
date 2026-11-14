import { cache } from "react";
import { toResult, type Result } from "../types";
import type { Asset } from "./types";
import { fetchCoinDetail, fetchMarkets, type CoinDetail } from "./coingecko";
import { fetchForexPairs } from "./forex";

const CRYPTO_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const FOREX_ID = /^usd-[a-z]{3}$/;
export const isValidAssetId = (id: string) => FOREX_ID.test(id) || CRYPTO_ID.test(id);

export interface AssetDetail {
  asset: Asset;
  /** Dados descritivos do provedor; null quando indisponíveis (a página segue funcionando). */
  coin: CoinDetail | null; coinError: boolean;
  /** Forex: extremos do período disponível (calculados da série do provedor). */
  range: { high: number; low: number; days: number } | null;
}

async function load(id: string): Promise<AssetDetail | null> {
  if (!isValidAssetId(id)) return null;
  if (FOREX_ID.test(id)) {
    const a = (await fetchForexPairs()).find((x) => x.id === id);
    if (!a) return null;
    const s = a.sparkline;
    return { asset: a, coin: null, coinError: false, range: s.length ? { high: Math.max(...s), low: Math.min(...s), days: s.length } : null };
  }
  const { items } = await fetchMarkets({ ids: [id] });
  const asset = items.find((x) => x.id === id);
  if (!asset) return null;
  let coin: CoinDetail | null = null, coinError = false;
  try { coin = await fetchCoinDetail(id); } catch { coinError = true; }   // falha nos dados descritivos não derruba a página
  return { asset, coin, coinError, range: null };
}
/** null no data = ativo inexistente/não suportado. */
export const getAssetDetail = cache((id: string): Promise<Result<AssetDetail | null>> => toResult(() => load(id)));
