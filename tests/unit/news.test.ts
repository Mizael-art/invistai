import { describe, it, expect } from "vitest";
import { normalizeArticles, canonicalUrl } from "@/services/news/newsapi";

const art = (o: Record<string, unknown>) => ({ title: "T", url: "https://ex.com/a", publishedAt: "2026-01-01T10:00:00Z", source: { name: "Fonte" }, ...o });
describe("normalizeArticles", () => {
  it("remove duplicatas por URL canônica e título", () => {
    const r = normalizeArticles({ articles: [art({}), art({ url: "https://ex.com/a/?utm_source=x" }), art({ url: "https://ex.com/b", title: "t" })] });
    expect(r).toHaveLength(1);
  });
  it("descarta itens sem título, sem data válida ou removidos", () => {
    const r = normalizeArticles({ articles: [art({ title: null }), art({ publishedAt: "xx", url: "https://ex.com/c", title: "C" }), art({ title: "[Removed]", url: "https://ex.com/d" })] });
    expect(r).toEqual([]);
  });
  it("ordena do mais recente para o mais antigo e usa id estável", () => {
    const r = normalizeArticles({ articles: [art({ title: "Velha", url: "https://ex.com/1", publishedAt: "2026-01-01T00:00:00Z" }), art({ title: "Nova", url: "https://ex.com/2", publishedAt: "2026-01-02T00:00:00Z" })] });
    expect(r.map((x) => x.title)).toEqual(["Nova", "Velha"]);
    expect(normalizeArticles({ articles: [art({ url: "https://ex.com/2", title: "Nova" })] })[0].id).toBe(r[0].id);
  });
  it("canonicalUrl remove parâmetros de rastreio e barra final", () => {
    expect(canonicalUrl("https://ex.com/p/?utm_medium=a&id=1#x")).toBe("https://ex.com/p?id=1");
  });
});

describe("segurança dos links de notícias (Etapa 15)", () => {
  it("descarta URL javascript:/data: e imagem não-https", async () => {
    const { normalizeArticles, isHttpUrl } = await import("@/services/news/newsapi");
    const now = Date.now(), d = new Date(now - 60_000).toISOString();
    const out = normalizeArticles({ articles: [
      { title: "A", url: "javascript:alert(1)", publishedAt: d }, { title: "B", url: "data:text/html,x", publishedAt: d },
      { title: "C", url: "https://ok.com/c", publishedAt: d, urlToImage: "javascript:alert(1)" }, { title: "D", url: "https://ok.com/d", publishedAt: d, urlToImage: "http://img.com/x.png" },
      { title: "E", url: "https://ok.com/e", publishedAt: d, urlToImage: "https://img.com/e.png" } ] }, { now });
    expect(out.map((x) => x.title).sort()).toEqual(["C", "D", "E"]);
    expect(out.find((x) => x.title === "C")!.imageUrl).toBeNull(); expect(out.find((x) => x.title === "D")!.imageUrl).toBeNull(); expect(out.find((x) => x.title === "E")!.imageUrl).toBe("https://img.com/e.png");
    expect(isHttpUrl("JAVASCRIPT:alert(1)")).toBe(false); expect(isHttpUrl(" https://x.com")).toBe(true);
  });
});
