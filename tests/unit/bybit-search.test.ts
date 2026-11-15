import { describe, it, expect } from "vitest";
import { rankSearch } from "@/services/market/bybit";

const c = (id: string, symbol: string, name: string, rank: number | null) => ({ id, symbol, name, rank });
describe("busca filtrada pelas moedas da Bybit", () => {
  const hits = [c("pepe-clone", "PEPE", "Pepe Clone", 900), c("pepe", "PEPE", "Pepe", 40), c("pepecoin", "PEPECOIN", "PepeCoin", 700), c("not-listed", "NLX", "Pepe Not Listed", 5), c("apepe", "APEPE", "Ape Pepe", 300)];
  it("só símbolos listados; um por símbolo (o de maior capitalização); exato > prefixo > resto", () => {
    expect(rankSearch(hits, "pepe", new Set(["PEPE", "PEPECOIN", "APEPE"])).map((x) => x.id)).toEqual(["pepe", "pepecoin", "apepe"]);
  });
  it("sem a lista da Bybit (falha), não filtra mas ainda ordena e remove clones", () => {
    expect(rankSearch(hits, "pepe", null).map((x) => x.id)).toEqual(["pepe", "pepecoin", "not-listed", "apepe"]);
  });
  it("limite de resultados", () => {
    expect(rankSearch(Array.from({ length: 30 }, (_, i) => c(`x${i}`, `X${i}`, `X ${i}`, i)), "x", null, 20)).toHaveLength(20);
  });
});
