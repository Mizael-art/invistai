import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/ai/knowledge";
import { trainingBlock } from "@/lib/ai/prompt";
import { retriable, llmFallbackEnv } from "@/lib/ai/llm";

describe("base de conhecimento", () => {
  it("divide por parágrafos respeitando o tamanho máximo e não perde texto", () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} ` + "palavra ".repeat(40));
    const chunks = chunkText(paras.join("\n\n"), 1200);
    expect(chunks.length).toBeGreaterThan(5); expect(chunks.every((c) => c.length <= 1200)).toBe(true);
    for (let i = 0; i < 30; i++) expect(chunks.some((c) => c.includes(`Parágrafo ${i} `))).toBe(true);
  });
  it("parágrafo gigante é quebrado por frases; texto vazio não gera trechos", () => {
    const big = Array.from({ length: 200 }, (_, i) => `Frase número ${i} sobre gestão de risco.`).join(" ");
    expect(chunkText(big, 1000).every((c) => c.length <= 1000)).toBe(true); expect(chunkText("  \n\n ")).toEqual([]);
  });
  it("bloco de treino: instruções, exemplos e trechos citáveis; vazio quando não há nada", () => {
    expect(trainingBlock(null, [])).toBe(""); expect(trainingBlock({ instructions: "", examples: [], docs: 0 }, [])).toBe("");
    const b = trainingBlock({ instructions: "Fale simples.", examples: [{ q: "O que é stop?", a: "Nível de invalidação." }], docs: 1 }, [{ title: "Risco", source: null, content: "Arrisque 1%.", rank: 1 }]);
    expect(b).toContain("Fale simples."); expect(b).toContain("nunca as anulam"); expect(b).toContain("Pergunta: O que é stop?"); expect(b).toContain("[Risco]\nArrisque 1%."); expect(b).toContain("search_knowledge_base");
  });
  it("IA reserva: só com chave própria; só erros transitórios acionam a troca", () => {
    expect(llmFallbackEnv({} as never)).toBeNull();
    expect(llmFallbackEnv({ AI_FALLBACK_API_KEY: "k", AI_FALLBACK_BASE_URL: "https://api.groq.com/openai/v1", AI_FALLBACK_MODEL: "m" } as never)).toMatchObject({ provider: "openai", model: "m", baseUrl: "https://api.groq.com/openai/v1" });
    expect(["rate_limited", "timeout", "network", "http_503"].every(retriable)).toBe(true); expect(["auth", "http_400", "empty"].some(retriable)).toBe(false);
  });
});
