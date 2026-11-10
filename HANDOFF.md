# HANDOFF — Controle de Projetos

> Nota de passagem de contexto. **Este projeto NÃO faz parte do Nautilus.**
> Nenhum segredo (token, senha) está registrado aqui. O repositório é público: nunca commitar backups/dados.

Atualizado em: 2026-11-10

---

## 1. O que é

Ferramenta web para controle de projetos/metas e atividades, independente do Nautilus:

- Projetos (= metas) com dados isolados; tela inicial seleciona o projeto.
- Atividades com responsável, datas planejadas, datas reais e **status automático**.
- Replanejamento: preserva a **data original**, marca a atividade, conta replanejamentos e exige motivo.
  - **Variação** é medida contra a data original.
  - **Atraso/status** é medido contra o **plano atual**.
- Etapas *dentro* de uma atividade (datas, responsável, peso próprios). As datas macro da atividade mandam no início e fim.
- Por projeto: dias úteis ou corridos, feriados e modo **Padrão** ou **Diário**.
  - Diário de avanço: Feito / Parcial % / Não feito. Dia sem lançamento conta como pendente.
  - Lançamento em lote. Atividades podem ficar fora do diário. Com etapas, o diário é por etapa.
- Painéis: Curva S (Plano original, Plano atual, Realizado, sem linhas tracejadas), Gantt expansível com etapas, ordenação por nº de replanejamentos.
- **Reunião** (usada toda quinta-feira):
  - mostra o que mudou desde a última reunião;
  - tem modo apresentação;
  - o botão "Fechar reunião" (manual, por projeto) grava um snapshot.
- Importar e exportar Excel (ExcelJS). Backup e restauração em JSON pela tela de admin.
- Login com perfis e permissões por projeto.

## 2. Onde está no ar

| Item | Valor |
|---|---|
| App (produção) | https://controle-de-projetos-drab.vercel.app |
| Vercel project | `controle-de-projetos` (`prj_sipimQPUMbdtNPApAZbuAz7OcJz8`), plano Hobby |
| Último deploy | `dpl_4aCB3PhXeDuzwCC3vETidzSubzNL` (READY) |
| Supabase project | `zcqyspaggvrwljsbnuqx`, URL `https://zcqyspaggvrwljsbnuqx.supabase.co` |
| Chave publishable (pública, já embutida no site) | `sb_publishable_RljREHVyBV75M-ynxTsagw_NoLioeSx` |
| Admin | e-mail do dono da conta. A senha já foi trocada pelo usuário (`must_change_pw=false`) |
| Artifact antigo (legado, cópia de 09/11) | https://claude.ai/artifact/UzpuTJRTd1RsWGN4J8r2EV |

**Não tocar:** Supabase `nautilus-abastecimentos` (`jmcghnptoagvjcgugzlf`) nem o projeto Vercel `nautilus-abastecimentos`.

## 3. Arquitetura

- SPA de arquivo único em JS puro (`index.html`), com roteamento por hash `#view--projectId`.
- Os vendors ficam locais: `vendor/supabase.js` (supabase-js 2.45.4 UMD) e `vendor/exceljs.min.js` (4.4.0).
- `vercel.json` define os headers de segurança:
  - CSP com `connect-src` restrito ao host Supabase (https e wss);
  - `frame-ancestors 'none'`;
  - `noindex`.
- Um adaptador `db` emula a API do artifact sobre o Supabase:
  - tabela `docs(coll, id, data jsonb)`;
  - carga paginada por coleção, mais realtime;
  - escrita via RPC `doc_set`, `doc_patch` e `doc_delete`.

### Banco (migration `schema_base_docs_perfis_acessos`)

Tabelas:

- `docs(coll, id, data jsonb, project_id, version, updated_at, updated_by)`
- `profiles(id → auth.users, email, nome, role admin|user, ativo, pessoa_id, must_change_pw)`
- `project_members(project_id, user_id, level leitor|responsavel|gestor)`

Funções auxiliares: `is_active`, `is_admin`, `my_level(pid)`, `my_pessoa`, `is_any_gestor`.

Trigger `docs_before`:

- preenche `project_id` (a partir de metaId, projetoId ou id);
- força `por` = usuário em eventos;
- limita o **responsável** a campos de execução (iniReal, fimReal, progresso, diario, iniAuto, fimAuto, etapas), apenas nos itens dele. Ele não pode criar, remover ou reordenar etapas.

RPCs de admin:

- `admin_create_user`
- `admin_set_password`
- `admin_delete_user`
- `me_password_changed`
- `get_nomes`

A função interna `_create_user` só pode ser executada pelo owner.

Testado com 44 casos de RLS, todos passaram. Os dados de teste foram removidos.

### Níveis de acesso (por projeto)

| Nível | Pode |
|---|---|
| Admin | Tudo, incluindo usuários, backup e restauração |
| Gestor | Edita o projeto inteiro |
| Responsável | Vê o projeto inteiro, mas lança execução só nas atividades e etapas dele |
| Leitor | Só visualiza |

Os usuários são criados pelo admin com senha temporária (nenhum e-mail é enviado). A troca de senha é obrigatória no primeiro acesso.

## 4. Código-fonte e build

Repositório: `Ahadi01072003/Controle-de-Projetos` (veja o README para a estrutura).

- `src/app-base.html` é a fonte base do app (versão artifact v12).
- `src/port.py` converte essa fonte em `site/index.html` (injeta `web_core.js` e `web.css`, permissões e telas de admin).
- `src/web_core.js` contém:
  - o adaptador Supabase;
  - login, troca de senha, bloqueio;
  - a tela de Usuários, com a matriz de níveis por projeto;
  - backup e restauração, e fechar reunião.
- `build.sh` gera `site/index.html` e checa a sintaxe. O resultado é idêntico ao deploy `dpl_4aCB3PhXeDuzwCC3vETidzSubzNL`.
- `site/` é o que vai para a Vercel (`index.html`, `vercel.json`, `vendor/`).
- `e2e/` tem os testes Playwright com Supabase simulado (`run.js`, `csp_test.js`, `restore_test.js`), todos passando.
  - Eles precisam de um backup real como massa de dados, via `SEED=...` ou `dados/backup.json`. A pasta `dados/` é ignorada pelo git.
- `supabase/migrations/` tem o schema exatamente como está aplicado no banco (conferido por md5).

### Deploy

Até o deploy `dpl_4aCB3PhXeDuzwCC3vETidzSubzNL`, a publicação foi feita pela REST API da Vercel com um token temporário de 1 dia, que deve ser revogado.

Caminho novo: ligar este repositório ao projeto Vercel `controle-de-projetos`. Em Settings → Git, conecte o repositório, use Root Directory `site`, Framework Preset "Other" e deixe o build vazio. Depois disso, cada push na `main` publica sozinho, sem precisar de token.

Se precisar de token outra vez, peça via `request_credential` (host `api.vercel.com`), nunca no chat.

## 5. Pendências do usuário (já comunicadas)

- [ ] Desativar "Allow new users to sign up" no Supabase (Auth → Providers / Settings).
- [ ] Apagar o token da Vercel.
- [ ] Ligar este repositório ao projeto Vercel (Settings → Git, Root Directory `site`).
- [ ] Criar os usuários da equipe e atribuir níveis por projeto.
- [ ] Fazer um piloto com uma conta Responsável.
- [ ] Fechar a reunião de quinta-feira pelo botão "Fechar reunião".
- [ ] Baixar backups periodicamente (Usuários → Backup).
- [ ] Avaliar uma organização Supabase / time Vercel separados se a ferramenta virar oficial. Hoje ela divide os limites do plano gratuito da conta com o Nautilus (2 projetos free, egress, MAU). O plano Hobby da Vercel não permite uso comercial.

## 6. Restrições e preferências do usuário

- Manter **totalmente separado do Nautilus** (dados, banco, deploy).
- A equipe **não** deve ter acesso de Editor nem poder publicar versões da página.
- Fluxo de aprovações e autolançamento antigos foram removidos a pedido. Do mundo "artifact" ficou só a parte de conflito de reuniões.
- Termos usados na interface: "Plano original" (nunca "Linha de base"), "Plano atual", "Realizado".
- O usuário fala português (pt-BR).
