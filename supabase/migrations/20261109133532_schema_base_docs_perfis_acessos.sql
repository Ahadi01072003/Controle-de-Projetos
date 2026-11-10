-- ============ tabelas ============
create table public.docs (
  coll text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  project_id text,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (coll, id)
);
create index docs_coll_proj_idx on public.docs (coll, project_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null,
  role text not null default 'user' check (role in ('admin','user')),
  ativo boolean not null default true,
  pessoa_id text,
  must_change_pw boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level text not null check (level in ('leitor','responsavel','gestor')),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

alter table public.docs enable row level security;
alter table public.profiles enable row level security;
alter table public.project_members enable row level security;
revoke all on public.docs, public.profiles, public.project_members from anon;

-- ============ funções auxiliares (SECURITY DEFINER, só leem) ============
create function public.is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo);
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo and p.role = 'admin');
$$;
create function public.my_level(pid text) returns text language sql stable security definer set search_path = '' as $$
  select m.level from public.project_members m join public.profiles p on p.id = m.user_id
  where m.user_id = auth.uid() and m.project_id = pid and p.ativo;
$$;
create function public.my_pessoa() returns text language sql stable security definer set search_path = '' as $$
  select p.pessoa_id from public.profiles p where p.id = auth.uid() and p.ativo;
$$;
create function public.is_any_gestor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m join public.profiles p on p.id = m.user_id
                 where m.user_id = auth.uid() and m.level = 'gestor' and p.ativo);
$$;
revoke execute on function public.is_active(), public.is_admin(), public.my_level(text), public.my_pessoa(), public.is_any_gestor() from public, anon;
grant execute on function public.is_active(), public.is_admin(), public.my_level(text), public.my_pessoa(), public.is_any_gestor() to authenticated;

-- ============ trigger: projeto do documento, versão e travas do responsável ============
create function public.docs_before() returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  me text; oldd jsonb; newd jsonb; k text; i int; e jsonb; oe jsonb; actmine boolean;
  allowed_act text[] := array['iniReal','fimReal','progresso','diario','atualizadoEm','iniAuto','fimAuto','etapas'];
  exec_act text[] := array['iniReal','fimReal','progresso','diario','iniAuto','fimAuto'];
  allowed_sub text[] := array['iniReal','fimReal','progresso','diario'];
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
          if k in ('progresso','diario') or (oldd->'etapas') is not distinct from (newd->'etapas') then
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
create trigger docs_before_trg before insert or update on public.docs
  for each row execute function public.docs_before();

-- ============ políticas dos documentos ============
create policy docs_select on public.docs for select to authenticated using (
  public.is_active() and (
    public.is_admin()
    or coll in ('pessoas','config')
    or (project_id is not null and public.my_level(project_id) is not null)
  )
);
create policy docs_insert on public.docs for insert to authenticated with check (
  public.is_active() and (
    public.is_admin()
    or (coll = 'pessoas' and public.is_any_gestor())
    or (coll = 'atividades' and project_id is not null and public.my_level(project_id) = 'gestor')
    or (coll = 'eventos' and project_id is not null and public.my_level(project_id) in ('gestor','responsavel'))
    or (coll = 'reunioes' and project_id is not null and public.my_level(project_id) = 'gestor')
  )
);
create policy docs_update on public.docs for update to authenticated
using (
  public.is_active() and (
    public.is_admin()
    or (coll = 'metas' and public.my_level(id) = 'gestor')
    or (coll in ('atividades','reunioes') and project_id is not null and public.my_level(project_id) in ('gestor','responsavel'))
  )
)
with check (
  public.is_active() and (
    public.is_admin()
    or (coll = 'metas' and public.my_level(id) = 'gestor')
    or (coll in ('atividades','reunioes') and project_id is not null and public.my_level(project_id) in ('gestor','responsavel'))
  )
);
create policy docs_delete on public.docs for delete to authenticated using (
  public.is_active() and (
    public.is_admin()
    or (coll in ('atividades','reunioes') and project_id is not null and public.my_level(project_id) = 'gestor')
  )
);

-- ============ perfis e acessos ============
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy members_select on public.project_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy members_admin_all on public.project_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============ operações de documento (RLS vale: SECURITY INVOKER) ============
create function public.doc_set(p_coll text, p_id text, p_data jsonb) returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.docs set data = p_data where coll = p_coll and id = p_id;
  if found then return; end if;
  insert into public.docs (coll, id, data) values (p_coll, p_id, p_data);
end $$;
create function public.doc_patch(p_coll text, p_id text, p_patch jsonb) returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.docs set data = data || p_patch where coll = p_coll and id = p_id;
  if not found then raise exception 'Documento não encontrado ou sem permissão (%/%).', p_coll, p_id; end if;
end $$;
create function public.doc_delete(p_coll text, p_id text) returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.docs where coll = p_coll and id = p_id;
end $$;
revoke execute on function public.doc_set(text,text,jsonb), public.doc_patch(text,text,jsonb), public.doc_delete(text,text) from public, anon;
grant execute on function public.doc_set(text,text,jsonb), public.doc_patch(text,text,jsonb), public.doc_delete(text,text) to authenticated;

create function public.get_nomes() returns table (id uuid, nome text) language sql stable security definer set search_path = '' as $$
  select p.id, p.nome from public.profiles p where public.is_active();
$$;
revoke execute on function public.get_nomes() from public, anon;
grant execute on function public.get_nomes() to authenticated;

-- ============ administração de usuários (sem enviar e-mail) ============
create function public._create_user(p_email text, p_nome text, p_senha text, p_pessoa text, p_admin boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid(); em text := lower(trim(p_email));
begin
  if char_length(p_senha) < 8 then raise exception 'A senha precisa ter pelo menos 8 caracteres.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = em) then raise exception 'Este e-mail já está cadastrado.'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
      extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', p_nome), now(), now(),
      '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, 'email',
      jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), now(), now(), now());
  insert into public.profiles (id, email, nome, role, pessoa_id, must_change_pw)
  values (uid, em, p_nome, case when p_admin then 'admin' else 'user' end, nullif(p_pessoa,''), true);
  return uid;
end $$;
revoke execute on function public._create_user(text,text,text,text,boolean) from public, anon, authenticated;

create function public.admin_create_user(p_email text, p_nome text, p_senha text, p_pessoa text default null, p_admin boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores criam usuários.'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'Informe o nome.'; end if;
  return public._create_user(p_email, trim(p_nome), p_senha, p_pessoa, p_admin);
end $$;
create function public.admin_set_password(p_user uuid, p_senha text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  if char_length(p_senha) < 8 then raise exception 'A senha precisa ter pelo menos 8 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  update public.profiles set must_change_pw = true where id = p_user;
  delete from auth.sessions where user_id = p_user;
end $$;
create function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  if p_user = auth.uid() then raise exception 'Você não pode excluir a si mesmo.'; end if;
  delete from auth.users where id = p_user;
end $$;
create function public.me_password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_pw = false where id = auth.uid();
$$;
revoke execute on function public.admin_create_user(text,text,text,text,boolean), public.admin_set_password(uuid,text), public.admin_delete_user(uuid), public.me_password_changed() from public, anon;
grant execute on function public.admin_create_user(text,text,text,text,boolean), public.admin_set_password(uuid,text), public.admin_delete_user(uuid), public.me_password_changed() to authenticated;

-- tempo real
alter publication supabase_realtime add table public.docs;
alter table public.docs replica identity full;
