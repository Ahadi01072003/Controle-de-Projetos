# Controle de Projetos

Ferramenta web para acompanhar projetos/metas, atividades, etapas, diário de avanço, reuniões semanais, Curva S e Gantt, com login e permissões por projeto.

- **Produção:** https://controle-de-projetos-drab.vercel.app
- **Hospedagem:** Vercel (projeto `controle-de-projetos`)
- **Banco e login:** Supabase (projeto `zcqyspaggvrwljsbnuqx`)

É um projeto independente: não tem relação com o sistema Nautilus.

> **Este repositório não guarda dados.** Backups (`.json`) e prints de teste ficam fora do git (ver `.gitignore`).
> A chave do Supabase em `build.sh` é a *publishable* (pública por natureza). A proteção dos dados é feita
> pelas regras de acesso (RLS) no banco.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `site/` | O que é publicado: `index.html` (o app inteiro), `vercel.json` (headers de segurança e CSP) e `vendor/` (supabase-js 2.45.4 e exceljs 4.4.0) |
| `src/` | Fonte do `index.html`: `app-base.html` (app), `web_core.js` (login, adaptador Supabase, usuários, backup), `web.css` e `port.py` (junta tudo) |
| `supabase/migrations/` | Schema do banco: tabelas, RLS, trigger, RPCs de admin |
| `e2e/` | Testes Playwright com um Supabase simulado (`fake_supabase.js`) |

## Alterar e publicar

1. Edite os arquivos em `src/`.
2. Rode `./build.sh`. Ele regera `site/index.html` e confere a sintaxe dos scripts.
3. Rode os testes (opcional, recomendado). Use um backup como massa de dados, que fica fora do git:
   ```bash
   cd e2e
   SEED=../dados/backup.json node run.js
   SEED=../dados/backup.json node csp_test.js
   SEED=../dados/backup.json node restore_test.js
   ```
   Você baixa o backup no app, em Usuários e acessos → Baixar backup.
4. Faça commit e push. Com o repositório ligado à Vercel (diretório raiz `site`, sem build), cada push na `main` publica em produção.

## Acessos

| Nível | Pode |
|---|---|
| Admin | Tudo, incluindo usuários, backup e restauração |
| Gestor | Edita o projeto inteiro |
| Responsável | Vê o projeto e lança execução só nas atividades e etapas dele |
| Leitor | Só visualiza |

As regras valem no banco (RLS + trigger `docs_before`), não só na tela. Os usuários são criados pelo admin com senha temporária, e a troca é obrigatória no primeiro acesso.

## Cuidados

- O plano gratuito do Supabase **não faz backup automático**. Baixe backups periodicamente.
- Projetos gratuitos do Supabase pausam após 7 dias sem uso.
- Quem pode fazer push neste repositório pode publicar o site. Dê acesso de escrita só a quem deve publicar.
