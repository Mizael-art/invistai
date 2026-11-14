import { describe, it, expect } from "vitest";
import { nextStack, canGoBack, NAV_MAX } from "@/lib/navStack";

describe("navStack", () => {
  it("primeira página: não há para onde voltar", () => { const s = nextStack([], "/aprender"); expect(s).toEqual(["/aprender"]); expect(canGoBack(s)).toBe(false); });
  it("navegar para frente empilha", () => { const s = nextStack(nextStack([], "/"), "/aprender"); expect(s).toEqual(["/", "/aprender"]); expect(canGoBack(s)).toBe(true); });
  it("mesma página (refresh) não duplica", () => expect(nextStack(["/", "/a"], "/a")).toEqual(["/", "/a"]));
  it("voltar (popstate) à página anterior desempilha", () => expect(nextStack(["/", "/mercado", "/aprender"], "/mercado", true)).toEqual(["/", "/mercado"]));
  it("navegar por link até a página de dois passos atrás EMPILHA (não é voltar)", () => expect(nextStack(["/vip", "/"], "/vip")).toEqual(["/vip", "/", "/vip"]));
  it("popstate para página que não é a anterior (avançar/pular) empilha", () => expect(nextStack(["/", "/a"], "/b", true)).toEqual(["/", "/a", "/b"]));
  it("limita o tamanho da pilha", () => {
    let s: string[] = []; for (let i = 0; i < NAV_MAX + 20; i++) s = nextStack(s, `/p${i}`);
    expect(s).toHaveLength(NAV_MAX); expect(s[s.length - 1]).toBe(`/p${NAV_MAX + 19}`);
  });
});
