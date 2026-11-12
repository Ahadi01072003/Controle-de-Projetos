-- v5: o responsável pode escrever as observações (campo obs) das atividades em que é o responsável.
-- Nas atividades dos outros continua bloqueado.
create or replace function public.docs_before() returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  me text; oldd jsonb; newd jsonb; k text; i int; e jsonb; oe jsonb; actmine boolean;
  allowed_act text[] := array['iniReal','fimReal','progresso','diario','notas','obs','atualizadoEm','iniAuto','fimAuto','etapas'];
  exec_act text[] := array['iniReal','fimReal','progresso','diario','notas','obs','iniAuto','fimAuto'];
  allowed_sub text[] := array['iniReal','fimReal','progresso','diario','notas'];
begin
  new.project_id := case new.coll
    when 'metas' then new.id
    when 'atividades' then nullif(new.data->>'metaId','')
    when 'eventos' then nullif(new.data->>'metaId','')
    when 'reunioes' then nullif(new.data->>'projetoId','')
    else null end;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then new.version := 1; else new.version := old.version + 1; end if;

  if new.coll = 'eventos' and tg_op = 'INSERT' and auth.uid() is not null then
    new.data := jsonb_set(new.data, '{por}', to_jsonb(auth.uid()::text));
  end if;

  -- responsável: só mexe na execução do que é dele
  if new.coll = 'atividades' and tg_op = 'UPDATE' and auth.uid() is not null
     and not public.is_admin() and coalesce(public.my_level(old.project_id), '') <> 'gestor' then
    me := public.my_pessoa();
    if me is null then raise exception 'Seu usuário não está ligado a um responsável.'; end if;
    oldd := old.data; newd := new.data; actmine := (oldd->>'respId') = me;
    for k in select key from jsonb_each(newd) loop
      if (oldd->k) is distinct from (newd->k) and not (k = any(allowed_act)) then
        raise exception 'O campo "%" só pode ser alterado por um gestor do projeto.', k; end if;
    end loop;
    for k in select key from jsonb_each(oldd) loop
      if not (newd ? k) and not (k = any(allowed_act)) then
        raise exception 'O campo "%" só pode ser alterado por um gestor do projeto.', k; end if;
    end loop;
    if not actmine then
      foreach k in array exec_act loop
        if (oldd->k) is distinct from (newd->k) then
          if k in ('progresso','diario','notas','obs') or (oldd->'etapas') is not distinct from (newd->'etapas') then
            raise exception 'Você só pode lançar nas atividades e etapas em que é o responsável.'; end if;
        end if;
      end loop;
    end if;
    if (oldd->'etapas') is distinct from (newd->'etapas') then
      if jsonb_array_length(coalesce(oldd->'etapas','[]'::jsonb)) <> jsonb_array_length(coalesce(newd->'etapas','[]'::jsonb)) then
        raise exception 'Criar ou excluir etapas só um gestor do projeto.'; end if;
      for i in 0 .. jsonb_array_length(coalesce(newd->'etapas','[]'::jsonb)) - 1 loop
        e := newd->'etapas'->i; oe := oldd->'etapas'->i;
        if (e->>'id') is distinct from (oe->>'id') then raise exception 'A ordem das etapas só um gestor altera.'; end if;
        if e is distinct from oe then
          if coalesce(nullif(oe->>'respId',''), oldd->>'respId') is distinct from me then
            raise exception 'Esta etapa é de outro responsável.'; end if;
          for k in select key from jsonb_each(e) union select key from jsonb_each(oe) loop
            if (e->k) is distinct from (oe->k) and not (k = any(allowed_sub)) then
              raise exception 'O campo "%" da etapa só um gestor altera.', k; end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;
