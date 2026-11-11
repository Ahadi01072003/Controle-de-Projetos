-- v3: financeiro por atividade e etapa (cronograma físico-financeiro e medições).
-- Só acrescenta colunas e uma tabela; nada existente muda de forma.

-- pagamentos e faturamento direto podem apontar para uma atividade ou etapa, e ter nº de medição
alter table public.fin_itens
  add column if not exists atividade_id text,
  add column if not exists etapa_id text,
  add column if not exists medicao text not null default '' check (char_length(medicao) <= 40);
create index if not exists fin_itens_ativ_idx on public.fin_itens (project_id, atividade_id);

-- distribuição automática do saldo entre atividades sem valor definido (padrão: ligada)
alter table public.fin_contratos add column if not exists auto_dist boolean not null default true;

-- valor de cada atividade (etapa_id = '') ou etapa: a fatia do contrato que ela representa
create table public.fin_valores (
  project_id text not null,
  atividade_id text not null,
  etapa_id text not null default '',
  valor numeric(14,2) not null check (valor >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (project_id, atividade_id, etapa_id)
);
alter table public.fin_valores enable row level security;
revoke all on public.fin_valores from anon;
create policy fin_valores_all on public.fin_valores for all to authenticated
  using (public.can_fin(project_id)) with check (public.can_fin(project_id));
create trigger fin_valores_touch before insert or update on public.fin_valores for each row execute function public.fin_touch();

-- histórico: identifica o que mudou também para os valores por atividade
create or replace function public.fin_audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  insert into public.fin_log (project_id, acao, tipo, item, por)
  values (r.project_id, lower(tg_op),
          case tg_table_name when 'fin_itens' then to_jsonb(r)->>'tipo' when 'fin_valores' then 'valor' else 'contrato' end,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new)) else to_jsonb(r) end,
          auth.uid());
  return null;
end $$;
revoke execute on function public.fin_audit() from public, anon, authenticated;
create trigger fin_valores_audit after insert or update or delete on public.fin_valores for each row execute function public.fin_audit();

-- cópia de segurança inclui os valores por atividade
create or replace function public.fazer_backup(p_origem text default 'manual') returns bigint
language plpgsql security definer set search_path = '' as $$
declare nid bigint; n int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  select (select count(*) from public.docs) + (select count(*) from public.fin_itens) + (select count(*) from public.fin_contratos) + (select count(*) from public.fin_valores) into n;
  insert into public.backups (origem, registros, dados)
  select case when p_origem = 'auto' then 'auto' else 'manual' end, n, jsonb_build_object(
    'versao', 3, 'origem', 'Controle de Projetos', 'geradoEm', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    'docs', coalesce((select jsonb_agg(jsonb_build_object('coll', d.coll, 'id', d.id, 'data', d.data) order by d.coll, d.id) from public.docs d), '[]'::jsonb),
    'fin_contratos', coalesce((select jsonb_agg(to_jsonb(c) order by c.project_id) from public.fin_contratos c), '[]'::jsonb),
    'fin_itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.project_id, i.data) from public.fin_itens i), '[]'::jsonb),
    'fin_valores', coalesce((select jsonb_agg(to_jsonb(v) order by v.project_id, v.atividade_id, v.etapa_id) from public.fin_valores v), '[]'::jsonb),
    'acessos', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', p.email, 'project_id', m.project_id, 'level', m.level, 'fin', m.fin))
                 from public.project_members m join public.profiles p on p.id = m.user_id), '[]'::jsonb))
  returning id into nid;
  delete from public.backups where id not in (select b.id from public.backups b order by b.criado_em desc limit 8);
  return nid;
end $$;
revoke execute on function public.fazer_backup(text) from public, anon;
grant execute on function public.fazer_backup(text) to authenticated;

alter publication supabase_realtime add table public.fin_valores;
