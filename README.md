# Controle de Projetos

Ferramenta web para acompanhar projetos, atividades, etapas, diário de avanço, reuniões semanais, Curva S, Gantt e financeiro. Tem login e permissões por projeto.

- **Produção:** https://controle-de-projetos-drab.vercel.app
- **Hospedagem:** Vercel, projeto `controle-de-projetos`
- **Banco e login:** Supabase, projeto `zcqyspaggvrwljsbnuqx`

É um projeto independente, sem relação com o sistema Nautilus.

> **Este repositório não guarda dados.** Backups (`.json`) e prints de teste ficam fora do git (ver `.gitignore`).
> A chave do Supabase em `build.sh` é a *publishable*, que já é pública. Quem protege os dados são as regras
> de acesso (RLS) do banco.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `site/` | O que vai para a Vercel: `index.html` (o app inteiro), `vercel.json` (headers de segurança e CSP) e `vendor/` (supabase-js 2.45.4 e exceljs 4.4.0) |
| `src/` | A fonte do `index.html` (detalhes abaixo) |
| `supabase/migrations/` | Schema do banco, na ordem em que foi aplicado |
| `e2e/` | Testes Playwright com um Supabase simulado (`fake_supabase.js`) |

Arquivos de `src/`:

- `app-base.html`: o app em si.
- `web_core.js`: login, adaptador Supabase, usuários, backup e cópias automáticas.
- `v2.js`: avisos, Minhas atividades, produtividade, juntar pessoas e navegação.
- `financeiro.js`: o módulo financeiro.
- `web.css` e `v2.css`: os estilos.
- `port.py`: junta tudo num arquivo só.

## Alterar e publicar

1. Edite os arquivos em `src/`.
2. Rode `./build.sh`. Ele regera `site/index.html` e confere a sintaxe dos scripts.
3. Rode os testes. São opcionais, mas recomendados. Eles usam um backup como massa de dados, que fica fora do git:
   ```bash
   cd e2e
   SEED=../dados/backup.json node run.js          # login, permissões e telas
   SEED=../dados/backup.json node csp_test.js     # CSP, Excel e backup
   SEED=../dados/backup.json node restore_test.js # restauração
   SEED=../dados/backup.json node v2_test.js      # avisos, financeiro, produtividade, juntar pessoas, celular
   ```
   Para baixar o backup, vá em Usuários e acessos → Baixar backup.
4. Faça commit e push. Com o repositório ligado à Vercel (diretório raiz `site`, sem build), cada push na `main` publica em produção. Push em outra branch gera só uma prévia.

## Acessos

| Nível (por projeto) | Pode |
|---|---|
| Admin | Tudo, incluindo usuários, backup e restauração |
| Gestor | Edita o projeto inteiro |
| Responsável | Vê o projeto e lança a execução só nas atividades e etapas dele |
| Leitor | Só visualiza |
| **R$ (financeiro)** | Marcado à parte, por projeto. Vê e lança contrato, pagamentos, faturamento direto e aditivos. Sem essa marca, quem é do projeto vê só os totais no painel |

As regras valem no banco (RLS, trigger `docs_before` e as funções `can_fin` e `fin_resumo`), não só na tela. O admin cria os usuários com senha temporária, e a troca da senha é obrigatória no primeiro acesso.

## Cuidados

- O banco faz **uma cópia automática por semana** (domingo, 03:17 de Brasília) e guarda as 8 mais recentes. As cópias aparecem em Usuários e acessos. Mesmo assim, baixe um backup de vez em quando.
- Projetos gratuitos do Supabase pausam depois de 7 dias sem uso.
- Quem pode fazer push neste repositório pode publicar o site. Dê acesso de escrita só a quem deve publicar.
