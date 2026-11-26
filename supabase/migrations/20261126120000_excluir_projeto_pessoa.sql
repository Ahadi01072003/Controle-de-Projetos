-- Exclusão completa de projeto e de responsável, numa transação só e com cópia de segurança antes.
-- Só administradores (mesma regra que já valia para apagar projetos e pessoas).

-- cópias feitas antes de uma exclusão ficam marcadas
alter table public.backups drop constraint if exists backups_origem_check;
alter table public.backups add constraint backups_origem_check check (origem in ('auto','manual','exclusao'));

create or replace function public.fazer_backup(p_origem text default 'manual') returns bigint
language plpgsql security definer set search_path = '' as $$
declare nid bigint; n int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  select (select count(*) from public.docs) + (select count(*) from public.fin_itens) + (select count(*) from public.fin_contratos) + (select count(*) from public.fin_valores) into n;
  insert into public.backups (origem, registros, dados)
  select case when p_origem in ('auto','exclusao') then p_origem else 'manual' end, n, jsonb_build_object(
    'versao', 3, 'origem', 'Controle de Projetos', 'geradoEm', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    'docs', coalesce((select jsonb_agg(jsonb_build_object('coll', d.coll, 'id', d.id, 'data', d.data) order by d.coll, d.id) from public.docs d), '[]'::jsonb),
    'fin_contratos', coalesce((select jsonb_agg(to_jsonb(c) order by c.project_id) from public.fin_contratos c), '[]'::jsonb),
    'fin_itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.project_id, i.data) from public.fin_itens i), '[]'::jsonb),
    'fin_valores', coalesce((select jsonb_agg(to_jsonb(v) order by v.project_id, v.atividade_id, v.etapa_id) from public.fin_valores v), '[]'::jsonb),
    'acessos', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', p.email, 'project_id', m.project_id, 'level', m.level, 'fin', m.fin))
                 from public.project_members m join public.profiles p on p.id = m.user_id), '[]'::jsonb))
  returning id into nid;
  -- guarda as 8 mais recentes de cada tipo (as de exclusão não empurram as semanais para fora)
  delete from public.backups b where b.id in (
    select x.id from (select id, row_number() over (partition by (origem = 'exclusao') order by criado_em desc) rn from public.backups) x where x.rn > 8);
  return nid;
end $$;

-- projeto: apaga o projeto, as atividades (com as etapas), reuniões, histórico, financeiro e acessos dele
create or replace function public.excluir_projeto(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare na int; ne int; nr int; nf int; bk bigint;
begin
  if not public.is_admin() then raise exception 'Apenas administradores excluem projetos.'; end if;
  if not exists (select 1 from public.docs where coll = 'metas' and id = p_id) then raise exception 'Projeto não encontrado.'; end if;
  bk := public.fazer_backup('exclusao');
  select count(*), coalesce(sum(jsonb_array_length(coalesce(data->'etapas','[]'::jsonb))), 0) into na, ne
    from public.docs where coll = 'atividades' and project_id = p_id;
  select count(*) into nr from public.docs where coll = 'reunioes' and project_id = p_id;
  select (select count(*) from public.fin_itens where project_id = p_id) + (select count(*) from public.fin_valores where project_id = p_id) into nf;
  delete from public.docs where coll in ('atividades','reunioes','eventos') and project_id = p_id;
  delete from public.docs where coll = 'metas' and id = p_id;
  delete from public.fin_valores where project_id = p_id;
  delete from public.fin_itens where project_id = p_id;
  delete from public.fin_contratos where project_id = p_id;
  delete from public.fin_log where project_id = p_id;
  delete from public.project_members where project_id = p_id;
  return jsonb_build_object('atividades', na, 'etapas', ne, 'reunioes', nr, 'financeiro', nf, 'backup', bk);
end $$;

-- responsável: apaga o cadastro e passa atividades, etapas e apoio para outra pessoa (ou deixa sem responsável)
create or replace function public.excluir_pessoa(p_id text, p_para text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  para text := coalesce(nullif(trim(p_para), ''), ''); na int := 0; ne int := 0; nap int := 0; nl int := 0; bk bigint;
  r record; d jsonb; ets jsonb; e jsonb; ap text[]; resp text; ch boolean;
begin
  if not public.is_admin() then raise exception 'Apenas administradores excluem responsáveis.'; end if;
  if not exists (select 1 from public.docs where coll = 'pessoas' and id = p_id) then raise exception 'Responsável não encontrado.'; end if;
  if para = p_id then raise exception 'Escolha outra pessoa para receber as atividades.'; end if;
  if para <> '' and not exists (select 1 from public.docs where coll = 'pessoas' and id = para) then raise exception 'A pessoa escolhida para receber as atividades não existe.'; end if;
  bk := public.fazer_backup('exclusao');
  for r in select id, data from public.docs where coll = 'atividades' and position(p_id in data::text) > 0 for update loop
    d := r.data; ch := false;
    if d->>'respId' = p_id then d := jsonb_set(d, '{respId}', to_jsonb(para)); na := na + 1; ch := true; end if;
    if jsonb_typeof(d->'etapas') = 'array' then
      ets := '[]'::jsonb;
      for e in select x from jsonb_array_elements(d->'etapas') x loop
        if e->>'respId' = p_id then e := jsonb_set(e, '{respId}', to_jsonb(para)); ne := ne + 1; ch := true; end if;
        ets := ets || jsonb_build_array(e);
      end loop;
      d := jsonb_set(d, '{etapas}', ets);
    end if;
    if jsonb_typeof(d->'apoioIds') = 'array' and (d->'apoioIds') ? p_id then
      resp := coalesce(d->>'respId', '');
      ap := array(select v from jsonb_array_elements_text(d->'apoioIds') v where v <> p_id and v <> resp);
      if para <> '' and para <> resp and not (para = any(ap)) then ap := ap || para; end if;
      d := jsonb_set(d, '{apoioIds}', to_jsonb(ap)); nap := nap + 1; ch := true;
    end if;
    if ch then update public.docs set data = d where coll = 'atividades' and id = r.id; end if;
  end loop;
  update public.docs set data = data || jsonb_build_object('respId', para) where coll = 'metas' and data->>'respId' = p_id;
  update public.profiles set pessoa_id = null where pessoa_id = p_id;
  get diagnostics nl = row_count;
  delete from public.docs where coll = 'pessoas' and id = p_id;
  return jsonb_build_object('atividades', na, 'etapas', ne, 'apoio', nap, 'logins', nl, 'backup', bk);
end $$;

revoke execute on function public.excluir_projeto(text), public.excluir_pessoa(text, text) from public, anon;
grant execute on function public.excluir_projeto(text), public.excluir_pessoa(text, text) to authenticated;
