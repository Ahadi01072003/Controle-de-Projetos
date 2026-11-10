-- v2: acesso financeiro por projeto, módulo financeiro com histórico, estado dos alertas
-- por usuário e cópias de segurança automáticas. Só acrescenta; nada existente muda de forma.

-- ============ 1. permissão financeira por projeto ============
alter table public.project_members add column if not exists fin boolean not null default false;

create function public.can_fin(pid text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m join public.profiles p on p.id = m.user_id
    where m.user_id = (select auth.uid()) and m.project_id = pid and m.fin and p.ativo);
$$;
revoke execute on function public.can_fin(text) from public, anon;
grant execute on function public.can_fin(text) to authenticated;

-- ============ 2. financeiro ============
create table public.fin_contratos (
  project_id text primary key,
  valor numeric(14,2) not null default 0 check (valor >= 0),
  obs text not null default '' check (char_length(obs) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.fin_itens (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  tipo text not null check (tipo in ('pagamento','fd','aditivo')),
  data date not null,
  descricao text not null check (char_length(descricao) between 1 and 300),
  fornecedor text not null default '' check (char_length(fornecedor) <= 160),
  nf text not null default '' check (char_length(nf) <= 60),
  valor numeric(14,2) not null check (valor <> 0 and (tipo = 'aditivo' or valor > 0)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index fin_itens_proj_idx on public.fin_itens (project_id, tipo, data);

create table public.fin_log (
  id bigint generated always as identity primary key,
  project_id text not null,
  acao text not null,
  tipo text not null,
  item jsonb not null,
  por uuid,
  em timestamptz not null default now()
);
create index fin_log_proj_idx on public.fin_log (project_id, em desc);

alter table public.fin_contratos enable row level security;
alter table public.fin_itens enable row level security;
alter table public.fin_log enable row level security;
revoke all on public.fin_contratos, public.fin_itens, public.fin_log from anon;

create policy fin_contratos_all on public.fin_contratos for all to authenticated
  using (public.can_fin(project_id)) with check (public.can_fin(project_id));
create policy fin_itens_all on public.fin_itens for all to authenticated
  using (public.can_fin(project_id)) with check (public.can_fin(project_id));
create policy fin_log_select on public.fin_log for select to authenticated
  using (public.can_fin(project_id));

-- autoria e datas sempre definidas pelo banco
create function public.fin_touch() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'fin_itens' then new.created_at := now(); new.created_by := auth.uid(); end if;
  else
    if tg_table_name = 'fin_itens' then new.created_at := old.created_at; new.created_by := old.created_by; new.project_id := old.project_id; end if;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
create trigger fin_itens_touch before insert or update on public.fin_itens for each row execute function public.fin_touch();
create trigger fin_contratos_touch before insert or update on public.fin_contratos for each row execute function public.fin_touch();

-- histórico de tudo o que muda no financeiro (ninguém grava direto no log)
create function public.fin_audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  insert into public.fin_log (project_id, acao, tipo, item, por)
  values (r.project_id, lower(tg_op), case when tg_table_name = 'fin_itens' then to_jsonb(r)->>'tipo' else 'contrato' end,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new)) else to_jsonb(r) end,
          auth.uid());
  return null;
end $$;
revoke execute on function public.fin_audit() from public, anon, authenticated;
create trigger fin_itens_audit after insert or update or delete on public.fin_itens for each row execute function public.fin_audit();
create trigger fin_contratos_audit after insert or update or delete on public.fin_contratos for each row execute function public.fin_audit();

-- resumo (só totais) para quem vê o projeto, mesmo sem acesso aos lançamentos
create function public.fin_resumo(pid text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.my_level(pid) is not null) then
    raise exception 'Sem acesso a este projeto.';
  end if;
  return jsonb_build_object(
    'contrato', coalesce((select c.valor from public.fin_contratos c where c.project_id = pid), 0),
    'aditivos', coalesce((select sum(i.valor) from public.fin_itens i where i.project_id = pid and i.tipo = 'aditivo'), 0),
    'fd',       coalesce((select sum(i.valor) from public.fin_itens i where i.project_id = pid and i.tipo = 'fd'), 0),
    'pago',     coalesce((select sum(i.valor) from public.fin_itens i where i.project_id = pid and i.tipo = 'pagamento'), 0),
    'itens',    (select count(*) from public.fin_itens i where i.project_id = pid),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('d', s.data, 'v', s.v) order by s.data)
                   from (select i.data, sum(i.valor) v from public.fin_itens i where i.project_id = pid and i.tipo = 'pagamento' group by i.data) s), '[]'::jsonb)
  );
end $$;
revoke execute on function public.fin_resumo(text) from public, anon;
grant execute on function public.fin_resumo(text) to authenticated;

-- ============ 3. estado por usuário (alertas lidos) ============
create table public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
revoke all on public.user_state from anon;
create policy user_state_own on public.user_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ 4. cópias de segurança automáticas ============
create table public.backups (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  origem text not null default 'auto' check (origem in ('auto','manual')),
  registros int not null,
  dados jsonb not null
);
alter table public.backups enable row level security;
revoke all on public.backups from anon;
create policy backups_admin_select on public.backups for select to authenticated using (public.is_admin());

create function public.fazer_backup(p_origem text default 'manual') returns bigint
language plpgsql security definer set search_path = '' as $$
declare nid bigint; n int;
begin
  -- pelo app só administradores; o agendador roda sem usuário
  if auth.uid() is not null and not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  select (select count(*) from public.docs) + (select count(*) from public.fin_itens) + (select count(*) from public.fin_contratos) into n;
  insert into public.backups (origem, registros, dados)
  select case when p_origem = 'auto' then 'auto' else 'manual' end, n, jsonb_build_object(
    'versao', 2, 'origem', 'Controle de Projetos', 'geradoEm', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    'docs', coalesce((select jsonb_agg(jsonb_build_object('coll', d.coll, 'id', d.id, 'data', d.data) order by d.coll, d.id) from public.docs d), '[]'::jsonb),
    'fin_contratos', coalesce((select jsonb_agg(to_jsonb(c) order by c.project_id) from public.fin_contratos c), '[]'::jsonb),
    'fin_itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.project_id, i.data) from public.fin_itens i), '[]'::jsonb),
    'acessos', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', p.email, 'project_id', m.project_id, 'level', m.level, 'fin', m.fin))
                 from public.project_members m join public.profiles p on p.id = m.user_id), '[]'::jsonb))
  returning id into nid;
  delete from public.backups where id not in (select b.id from public.backups b order by b.criado_em desc limit 8);
  return nid;
end $$;
revoke execute on function public.fazer_backup(text) from public, anon;
grant execute on function public.fazer_backup(text) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('backup-semanal-controle', '17 6 * * 0', $$select public.fazer_backup('auto')$$);

-- ============ 5. tempo real do financeiro (RLS vale também aqui) ============
alter publication supabase_realtime add table public.fin_itens, public.fin_contratos;
