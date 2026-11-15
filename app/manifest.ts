import type { MetadataRoute } from "next";

/** Manifesto do app (PWA): permite "Adicionar à tela inicial" com o ícone TRADEON e abrir em tela cheia. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRADEON", short_name: "TRADEON", description: "Seu mercado financeiro em um só lugar.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait", background_color: "#080D0B", theme_color: "#080D0B", lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
