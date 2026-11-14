# INVISTAÍ — Handoff do frontend para o backend

Arquivo único: `invistai.html` (HTML + CSS + JS vanilla, sem build). Todo estado é local; nada é enviado a servidor.

## Como rodar
Abra `invistai.html` no navegador (ou publique como página estática). Login aceita qualquer e-mail válido + senha preenchida (sessão demonstrativa).

## Rotas (hash)
login, register, forgot, reset, confirm, onboarding, home, market, asset/:sym, news, news/:id, learn, vip, checkout, signals, live, chat, notifs, alerts, favs, profile, security, support.

## Pontos de integração (o que substituir)
| Área | Hoje (mock) | Backend a implementar |
|---|---|---|
| Auth | `login`/`reg`/`forgot`/`rset` validam local e setam `S.auth` | cadastro, login, recuperação, confirmação de e-mail, sessões |
| Ativos/mercado | `A` (14 ativos), gráficos gerados em `chart()` | cotações, candles, favoritos sincronizados |
| Notícias | `NW`, `NC` | feed por categoria, fonte/URL original |
| Aprender | `LB`, `TR`, `CH`, `S.prog`, `S.hist` | conteúdos, trilhas, progresso, ebooks/PDF |
| VIP | `S.vip` (8 estados), `VS` | máquina de estados da assinatura, checkout Pix/cartão, webhooks |
| Sinais | `SG` | sinais, status, timeline (acesso só VIP ativo) |
| Lives/gravações | `EV`, `REC` | agenda, lembretes, player |
| Chat IA | `aiReply()`, `send()`, `S.chats` | conversas, limites free/VIP, modelo de IA |
| Notificações | `NT`, `S.read`, `S.tg` | lista, leitura, preferências por categoria |
| Perfil | `PF()`, `S.pf`, `S.sess` | perfil, senha, sessões, exclusão via suporte |
| Suporte | `FQ`, `SUP` (placeholder) | FAQ, e-mail oficial configurável |

## Estado de assinatura (`S.vip`)
free, active, pending, refused, suspended, expired, cancel_req, cancelled_paid. `vipOn()` libera Sinais, Lives, Telegram e conteúdo premium (active, cancel_req, cancelled_paid).

## Regras já refletidas na UI
Pix sem renovação automática; cartão com consentimento opcional; cancelamento mantém acesso até o fim do período; preços "a definir" (R$ —); busca global só de ativos; sem compra/venda/ordens.

## Pendências deliberadas
Preços e duração do teste VIP, e-mail de suporte oficial, URL de fonte original das notícias, integração TradingView, ebook PDF real.
