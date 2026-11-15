import { describe, it, expect } from "vitest";
import { llmChain } from "@/lib/ai/llm";

describe("cadeia de modelos da IA", () => {
  const E = { AI_API_KEY: "k1", AI_BASE_URL: "https://api.groq.com/openai/v1", AI_MODEL: "openai/gpt-oss-120b", AI_ALT_MODELS: "openai/gpt-oss-20b, openai/gpt-oss-120b,",
    AI_FALLBACK_API_KEY: "k2", AI_FALLBACK_BASE_URL: "https://g/v1beta/openai", AI_FALLBACK_MODEL: "gemini-flash-latest", AI_FALLBACK_ALT_MODELS: "gemini-flash-lite-latest" } as unknown as NodeJS.ProcessEnv;
  it("principal → alternativos do mesmo provedor (mesma chave) → reserva → alternativos da reserva, sem repetir", () => {
    const c = llmChain(E);
    expect(c.map((x) => x.model)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b", "gemini-flash-latest", "gemini-flash-lite-latest"]);
    expect(c.map((x) => x.apiKey)).toEqual(["k1", "k1", "k2", "k2"]);
  });
  it("sem variáveis extras continua só principal + reserva", () => {
    expect(llmChain({ AI_API_KEY: "k1" } as unknown as NodeJS.ProcessEnv)).toHaveLength(1);
  });
});
