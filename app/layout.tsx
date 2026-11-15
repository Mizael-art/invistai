import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";            // Inter servida pelo próprio app (sem Google Fonts em tempo de execução)
import "./globals.css";
import { getPrefs } from "@/lib/i18n/server";
import { Splash, SPLASH_SCRIPT } from "@/components/layout/Splash";

export const metadata: Metadata = { title: "TRADEON", description: "TRADEON — Seu mercado financeiro em um só lugar. Mercados, ativos, notícias e informação com fonte e horário.", appleWebApp: { capable: true, title: "TRADEON", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#080D0B" }, { media: "(prefers-color-scheme: light)", color: "#F4F6F4" }] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, theme } = await getPrefs();
  return (
    <html lang={lang === "pt" ? "pt-BR" : "en"} data-theme={theme} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} /></head>
      <body><Splash />{children}</body>
    </html>
  );
}
