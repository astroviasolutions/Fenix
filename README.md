# Fenix Distribuidora e Logística · Gestão

Sistema de gestão da operação: **Painel, Cargas, Contagem, Entregas, Motorista (celular + bipagem), Comissão, Resultado, Caixa, Rastreador e Ajustes**.
Marca: preto + laranja da fênix. React + Vite, CSS próprio, GSAP e Three.js só na tela de login.

## Como a Fenix opera (e como o sistema reflete isso)

- **Cargas**: o parceiro manda o romaneio em PDF ou Excel. O **leitor universal** (`src/leitor/`) reconhece sozinho as colunas, corrige acentos quebrados e "Castro/RP", junta pacotes do mesmo endereço, confere o total impresso no documento e mostra tudo numa prévia antes de importar. Se errar uma coluna, o dono corrige na própria prévia. Sem IA: só geometria do PDF, vocabulário de rótulos e padrões de conteúdo.
- **Contagem**: a planilha de controle, em tela. Pacotes por dia × motorista × parceiro, com total e valor a pagar. O lançamento manual vale mais que a bipagem; quando os dois diferem, a célula é destacada.
- **Bipagem**: cada motorista tem login próprio e bipa o seu romaneio (câmera, leitor Bluetooth ou digitando). Pacote de outro motorista é recusado.
- **Resultado**: entradas dos parceiros − motoristas − fixas (1ª quinzena) − combustível − impostos, por quinzena e por mês, como na planilha FENIX 2026. Inclui a **conferência com o parceiro** (lançado × informado × ajuste).
- **Comissão**: acerto quinzenal (1–15 e 16–fim), valor por pacote individual por motorista, vales e descontos.

## Rodar

```bash
npm install
npm run dev
```

Sem Supabase o sistema roda em **modo demonstração** (sem senha, dados só no navegador, tudo fictício).

## Leitor de arquivos — formatos validados

| Parceiro | Formato | Leitura |
|---|---|---|
| Total Express (CAF Consolidada) | tabela em PDF, 1 linha por pacote | tabela geométrica |
| Anjun | tabela com células quebradas em várias linhas | tabela geométrica (âncora na numeração) |
| !Mile / Imile | runsheet, texto centralizado na linha | tabela geométrica |
| Magalog | fichas "Rótulo valor" por entrega | blocos |
| Diálogo | cabeçalho em 3 linhas, registro de várias linhas | romaneio de transportadora (CTRC) |
| qualquer Excel/CSV | cabeçalho em qualquer linha | planilha |

Testar o leitor no terminal (Node): ver `src/leitor/` — `lerPaginas(paginas)` recebe as páginas do `paginasDe(pdfjs, bytes)`.
Parceiro com layout novo: se o leitor não reconhecer, a prévia mostra as colunas e permite mapear à mão; se nada servir, "Lançar à mão" e a aba Contagem cobrem.

## Próximo passo: Supabase da Fenix

1. Crie um projeto **novo e exclusivo da Fenix** (nunca reaproveite o banco de outro cliente).
2. **SQL Editor** → rode `supabase/schema.sql` inteiro (cria as tabelas, liga o **RLS em todas** e cria as funções do motorista).
3. **Authentication → Providers → Email**: desative "Allow new users to sign up". Só o dono cria usuários (um login por motorista).
4. Crie o usuário do dono e promova: `update public.perfis set papel = 'dono' where id = (select id from auth.users where email = 'EMAIL_DO_DONO');`
5. `.env` a partir de `.env.example`, só com a chave **publicável** (a `service_role` nunca vai para o front).
6. A camada de dados ainda é local (`src/store.js`); a troca para o Supabase é feita ali, sem mexer nas telas, junto com o teste das políticas de RLS (dono vê tudo; motorista só as próprias paradas, pelas funções `motorista_*`).

## Publicar

**Atenção:** o modo demonstração não tem senha. Nunca publique sem as variáveis `VITE_SUPABASE_*` e sem testar o RLS. React → Vercel.

## Pendências e suposições (confirmar com o cliente)

- **Contar por entrega ou por bipagem?** Hoje a contagem automática considera pacotes *entregues* (baixa) e o lançamento manual. Trocar para "bipados" é uma condição em `pacotesPeriodo` (`src/lib.js`).
- **Imposto**: na planilha FENIX 2026 o percentual (16%) incide só sobre a 1ª quinzena. Aqui incide sobre todas as entradas do mês. Confirmar.
- **Fixas**: cobradas na 1ª quinzena, como na planilha.
- **Total Express B2B**: o PDF informa 106 e a tabela traz 101; os 5 B2B estão em outras páginas (CT-e). O leitor avisa a diferença, mas ainda não lê essas páginas.
- Logo: o arquivo em `public/logo-*.webp` foi recortado de uma foto de tela. Trocar pelo original em alta.

## Teste

Projeto Vercel `fenix-gestao`. Cada push na branch gera um preview (protegido por login Vercel). Abra a tela de login e use "Entrar com dados fictícios".
