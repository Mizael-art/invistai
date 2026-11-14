# Etapa 14 — Suporte (por e-mail)

## Regra
O suporte é feito **somente por e-mail**, com o endereço oficial em `SUPPORT_EMAIL` (lido em runtime no servidor). **Nenhum endereço é inventado:** sem a variável — ou com valor inválido/de exemplo (`example.com`, `.invalid`, `localhost`…) — o canal aparece como **"Canal de suporte indisponível"**, com os botões desabilitados e o pedido de configuração ("Administrador: defina SUPPORT_EMAIL"). Não há sistema de chamados.

## Página `/suporte` (pública — visitantes também acessam)
- **Fale com o suporte:** mostra o endereço configurado; **Assunto** (Dúvida geral, Acesso e login, Dados de mercado e notícias, Conta e perfil, Exclusão de conta, Erro no aplicativo); **Enviar e-mail** = link `mailto:` válido (assunto e corpo codificados) que abre o app de e-mail do usuário — o INVISTAÍ não envia nada; **Copiar e-mail** com confirmação e, se a cópia falhar, aviso + seleção do endereço para cópia manual. `?assunto=` pré-seleciona o assunto (valores desconhecidos caem em "Dúvida geral").
- **Perguntas frequentes:** 8 respostas reais sobre o funcionamento do app (fontes de dados, notícias, senha, confirmação de e-mail, exclusão de conta, notificações, sincronização, VIP/Aprender), com busca que ignora acentos/maiúsculas, contador e estado "Nenhum resultado".
- PT/EN, temas claro/escuro, mobile, teclado.

## Validação do endereço (`lib/support.ts`)
`parseSupportEmail`: formato de e-mail (zod), até 254 caracteres, sem espaços/`?`/`&`/`,`/`<>`/quebras de linha (impede injeção de `cc`/`bcc` no `mailto:`), recusa domínios de exemplo. Valor inválido gera aviso no log do servidor.

## Componentes compartilhados alterados (documentado e testado)
- **Menu lateral:** novo item **Suporte** no rodapé (o menu passa de 5 para 6 links; testes de Mercado/Detalhes/Notícias/Aprender/VIP atualizados).
- **Login:** "Precisa de ajuda? Suporte" → `/suporte?assunto=access`.
- **Perfil:** card "Ajuda e suporte"; o pedido de exclusão passa a usar o mesmo e-mail validado, com assunto "Suporte INVISTAÍ — Exclusão de conta".
- Removida a rota provisória `app/(app)/[section]` (não há mais páginas "etapa futura").

## Testes
- Unitários (149 no total): validação do e-mail (ausente, inválido, injeção, placeholder, leitura em runtime), `mailto:` (codificação), busca do FAQ, assuntos, textos PT/EN sem e-mail fixo.
- E2E Suporte (**32**) com três servidores (sem variável, placeholder, válido) + regressão de todas as etapas.
- **Não testável aqui:** a abertura real do aplicativo de e-mail do dispositivo (o teste verifica o link `mailto:` e que nada é enviado pelo servidor).

## Pendência
Definir o **endereço oficial de suporte** e configurá-lo em `SUPPORT_EMAIL` no ambiente de produção.
