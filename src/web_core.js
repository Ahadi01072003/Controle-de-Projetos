/* ===================== CONEXÃO COM O BANCO (Supabase) ===================== */
const SUPA_URL = '__SUPA_URL__', SUPA_KEY = '__SUPA_KEY__';
let sb = null;
const DATA_COLLS = ['atividades', 'metas', 'pessoas', 'reunioes', 'config'];
const newId = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; crypto.getRandomValues(new Uint8Array(20)).forEach(n => s += a[n % 36]); return s; };
function dbErr(e) {
  const m = (e && e.message) || String(e || ''), c = e && e.code;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(m)) return { code: 'unavailable', message: 'Sem conexão com o servidor.' };
  if (c === 'P0001') return { code: 'permission', message: m };
  if (c === '42501' || c === 'PGRST301' || /row-level security|permission denied|JWT/i.test(m)) return { code: 'permission', message: 'Você não tem permissão para esta alteração.' };
  return { code: c || 'error', message: m };
}
const clone = o => JSON.parse(JSON.stringify(o));

function makeDb() {
  const cache = {}, subs = {}, ready = {};
  DATA_COLLS.forEach(c => { cache[c] = new Map(); subs[c] = new Set(); });
  const docSnap = (c, id) => ({ id, exists: cache[c].has(id), data: () => cache[c].get(id) });
  const snapOf = c => { const docs = [...cache[c].entries()].map(([id, data]) => ({ id, exists: true, data: () => data })); return { docs, size: docs.length, empty: !docs.length }; };
  const emit = c => subs[c].forEach(h => { try { h.next(h.doc != null ? docSnap(c, h.doc) : snapOf(c)); } catch (e) { console.error(e); } });
  async function load(c) {
    const out = new Map(); let from = 0;
    for (;;) {
      const { data, error } = await sb.from('docs').select('id,data').eq('coll', c).order('id').range(from, from + 999);
      if (error) throw error;
      data.forEach(r => out.set(r.id, r.data));
      if (data.length < 1000) break; from += 1000;
    }
    cache[c] = out; ready[c] = true; emit(c);
  }
  let ch = null;
  function listen() {
    if (ch) return;
    ch = sb.channel('docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
      const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r || !cache[r.coll]) return;
      if (p.eventType === 'DELETE') cache[r.coll].delete(r.id); else cache[r.coll].set(r.id, p.new.data);
      emit(r.coll);
    }).subscribe();
  }
  const docRef = (c, id) => ({
    id, path: c + '/' + id,
    onSnapshot(next) { const h = { next, doc: id }; subs[c].add(h); if (ready[c]) setTimeout(() => next(docSnap(c, id)), 0); return () => subs[c].delete(h); },
    async set(d) { const { error } = await sb.rpc('doc_set', { p_coll: c, p_id: id, p_data: d }); if (error) throw dbErr(error); if (cache[c]) { cache[c].set(id, clone(d)); emit(c); } },
    async update(d) { const { error } = await sb.rpc('doc_patch', { p_coll: c, p_id: id, p_patch: d }); if (error) throw dbErr(error); if (cache[c]) { cache[c].set(id, { ...(cache[c].get(id) || {}), ...clone(d) }); emit(c); } },
    async delete() { const { error } = await sb.rpc('doc_delete', { p_coll: c, p_id: id }); if (error) throw dbErr(error); if (cache[c]) { cache[c].delete(id); emit(c); } },
  });
  function query(c) {
    const q = { w: [], o: null, l: null }, M = { '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt', '==': 'eq' };
    const api = {
      where(f, op, v) { q.w.push([f, op, v]); return api; }, orderBy(f, d) { q.o = [f, d || 'asc']; return api; }, limit(n) { q.l = n; return api; },
      async get() {
        let r = sb.from('docs').select('id,data').eq('coll', c);
        q.w.forEach(([f, op, v]) => { r = r[M[op]]('data->>' + f, v); });
        if (q.o) r = r.order('data->>' + q.o[0], { ascending: q.o[1] !== 'desc' });
        if (q.l) r = r.limit(q.l);
        const { data, error } = await r; if (error) throw dbErr(error);
        const docs = data.map(x => ({ id: x.id, exists: true, data: () => x.data })); return { docs, size: docs.length, empty: !docs.length };
      },
    };
    return api;
  }
  return {
    collection(c) {
      return { path: c, doc: id => docRef(c, id || newId()), where: (...a) => query(c).where(...a), orderBy: (...a) => query(c).orderBy(...a), limit: n => query(c).limit(n),
        onSnapshot(next) { const h = { next }; subs[c].add(h); if (ready[c]) setTimeout(() => next(snapOf(c)), 0); return () => subs[c].delete(h); } };
    },
    doc(path) { const [c, id] = path.split('/'); return docRef(c, id); },
    async start() { await Promise.all(DATA_COLLS.map(load)); listen(); },
    async reloadAll() { await Promise.all(DATA_COLLS.map(load)); },
    stop() { if (ch) { sb.removeChannel(ch); ch = null; } },
  };
}

/* ---------- permissões (a regra de verdade está no banco; aqui só ajusta a tela) ---------- */
const lvl = pid => S.isAdmin ? 'gestor' : (pid && pid !== '_none' ? S.lv[pid] || null : null);
const canManage = pid => lvl(pid) === 'gestor';
const myPessoa = () => (S.me && S.me.pessoa_id) || null;
const anyGestor = () => S.isAdmin || Object.values(S.lv).includes('gestor');
function canLog(a, s) {
  if (!a) return false;
  const l = lvl(a.metaId); if (l === 'gestor') return true; if (l !== 'responsavel') return false;
  const me = myPessoa(); if (!me) return false;
  return s ? (s.respId || a.respId) === me : a.respId === me;
}
function syncPerm() { S.canWrite = S.proj ? (S.proj === '_none' ? S.isAdmin : canManage(S.proj)) : S.isAdmin; }

async function write(fn, quiet = false) {
  if (!db) { toast('Sem conexão com os dados.', 'err'); return false; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await fn(); S.wrote = true; return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'unavailable' && attempt < 2) { await new Promise(r => setTimeout(r, 600 + Math.random() * 900 * (attempt + 1))); continue; }
      if (!quiet) toast(code === 'permission' ? e.message : code === 'unavailable' ? 'Sem conexão com o servidor. Tente de novo.' : 'Não foi possível salvar. Tente de novo em instantes.', 'err');
      return false;
    }
  }
  return false;
}
function onData() {
  S.ver++;
  const L = S.loaded;
  if (S.state === 'loading' && L.a && L.m && L.p && L.c) {
    S.state = 'ready'; S.animUntil = performance.now() + 1500; resolveNames();
    const r = parseHash(location.hash.slice(1)); S.view = r.view; S.proj = r.proj;
    if (S.proj && S.proj !== '_none' && !metaById(S.proj)) { S.view = 'projetos'; S.proj = null; history.replaceState(null, '', '#projetos'); }
    else if (!location.hash && S.metas.length === 1 && !S.isAdmin) { S.view = 'painel'; S.proj = S.metas[0].id; history.replaceState(null, '', '#painel--' + S.proj); }
  } else if (S.state === 'ready' && S.proj && S.proj !== '_none' && !metaById(S.proj)) { location.hash = 'projetos'; }
  schedule();
}
async function resolveNames() {
  if (!sb || S.namesLoaded) return; S.namesLoaded = true;
  try { const { data } = await sb.rpc('get_nomes'); (data || []).forEach(r => S.names[r.id] = r.nome); schedule(); } catch (e) { S.namesLoaded = false; }
}
function mergeReunioes(docs) {
  const m = new Map();
  docs.forEach(d => { const x = d.data(); if (!x || !x.data) return; if (!m.has(x.data)) m.set(x.data, { id: x.data, data: x.data, fotos: {}, projetos: {}, fechadaEm: x.fechadaEm || '' });
    const o = m.get(x.data); Object.assign(o.fotos, x.fotos || {}); Object.assign(o.projetos, x.projetos || {}); if ((x.fechadaEm || '') > o.fechadaEm) o.fechadaEm = x.fechadaEm; });
  return [...m.values()];
}

/* ---------- entrada: login, senha e sessão ---------- */
function authShow(html) { const el = $('#auth'); el.innerHTML = `<div class="authcard">${html}</div>`; el.hidden = false; document.body.classList.add('authing'); const f = el.querySelector('input:not([type=hidden])'); if (f) setTimeout(() => f.focus(), 50); }
function authHide() { const el = $('#auth'); el.hidden = true; el.innerHTML = ''; document.body.classList.remove('authing'); }
const authBrand = `<div class="auth-brand"><svg viewBox="0 0 34 34" aria-hidden="true" width="40" height="40"><rect x="1" y="1" width="32" height="32" rx="9" fill="#2445d6"/><path d="M7 24.5h20" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M17 9.5 23 21H11Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M7 24.5h6" stroke="#fab219" stroke-width="2.2" stroke-linecap="round"/></svg><div><b>Controle de Projetos</b><small>Prazos e replanejamentos</small></div></div>`;
function showLogin(msg = '') {
  authShow(`${authBrand}<h1>Entrar</h1><p class="muted">Use o e-mail e a senha que o administrador criou para você.</p>
    <form id="flg" novalidate><label for="lg-e">E-mail</label><input class="inp" id="lg-e" type="email" autocomplete="username" inputmode="email" required>
    <label for="lg-p">Senha</label><input class="inp" id="lg-p" type="password" autocomplete="current-password" required>
    <p class="err" id="lg-err" role="alert">${esc(msg)}</p><button class="btn primary" type="submit" id="lg-b">Entrar</button></form>
    <p class="muted" style="font-size:12.5px;margin:14px 0 0">Esqueceu a senha? Peça ao administrador para redefinir.</p>`);
  $('#flg').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#lg-b'), er = $('#lg-err'); er.textContent = '';
    const em = $('#lg-e').value.trim().toLowerCase(), pw = $('#lg-p').value;
    if (!em || !pw) { er.textContent = 'Informe e-mail e senha.'; return; }
    b.disabled = true; b.textContent = 'Entrando…';
    const { data, error } = await sb.auth.signInWithPassword({ email: em, password: pw });
    if (error) { b.disabled = false; b.textContent = 'Entrar'; er.textContent = /Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : /fetch|network/i.test(error.message) ? 'Sem conexão com o servidor.' : error.message; return; }
    await afterLogin(data.session);
  });
}
function showChangePw(forced) {
  authShow(`${authBrand}<h1>${forced ? 'Defina sua senha' : 'Trocar senha'}</h1><p class="muted">${forced ? 'Primeiro acesso (ou senha redefinida). Escolha uma senha nova, com pelo menos 8 caracteres.' : 'Escolha uma senha nova, com pelo menos 8 caracteres.'}</p>
    <form id="fcp" novalidate><label for="cp1">Nova senha</label><input class="inp" id="cp1" type="password" autocomplete="new-password">
    <label for="cp2">Repita a nova senha</label><input class="inp" id="cp2" type="password" autocomplete="new-password">
    <p class="err" id="cp-err" role="alert"></p><div class="auth-row"><button class="btn primary" type="submit" id="cp-b">Salvar senha</button>${forced ? '<button type="button" class="btn ghost" id="cp-out">Sair</button>' : '<button type="button" class="btn ghost" id="cp-no">Cancelar</button>'}</div></form>`);
  const o = $('#cp-out'); if (o) o.onclick = () => sb.auth.signOut();
  const n = $('#cp-no'); if (n) n.onclick = authHide;
  $('#fcp').addEventListener('submit', async e => {
    e.preventDefault(); const er = $('#cp-err'), p1 = $('#cp1').value, p2 = $('#cp2').value; er.textContent = '';
    if (p1.length < 8) { er.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    if (p1 !== p2) { er.textContent = 'As duas senhas não são iguais.'; return; }
    const b = $('#cp-b'); b.disabled = true;
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { b.disabled = false; er.textContent = /different from the old/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : error.message; return; }
    await sb.rpc('me_password_changed'); if (S.me) S.me.must_change_pw = false;
    authHide(); toast('Senha alterada.', 'ok'); if (forced) startApp();
  });
}
function showBlocked(msg) {
  authShow(`${authBrand}<h1>Acesso não liberado</h1><p class="muted">${esc(msg)}</p><button class="btn" id="bl-out">Sair</button>`);
  $('#bl-out').onclick = () => sb.auth.signOut();
}
async function loadAccess() {
  const [p, m] = await Promise.all([sb.from('profiles').select('*').eq('id', S.userId).maybeSingle(), sb.from('project_members').select('project_id,level').eq('user_id', S.userId)]);
  if (p.error || m.error) throw (p.error || m.error);
  return { prof: p.data, lv: Object.fromEntries((m.data || []).map(r => [r.project_id, r.level])) };
}
async function afterLogin(session) {
  S.userId = session.user.id;
  let acc; try { acc = await loadAccess(); } catch (e) { showLogin('Não foi possível carregar seu perfil. Verifique a conexão e tente de novo.'); return; }
  if (!acc.prof || !acc.prof.ativo) { showBlocked(!acc.prof ? 'Sua conta existe, mas ainda não foi cadastrada neste sistema. Fale com o administrador.' : 'Sua conta está desativada. Fale com o administrador.'); return; }
  S.me = acc.prof; S.isAdmin = acc.prof.role === 'admin'; S.lv = acc.lv;
  if (S.me.must_change_pw) { showChangePw(true); return; }
  authHide(); startApp();
}
async function startApp() {
  if (S.started) return; S.started = true;
  S.state = 'loading'; render();
  db = makeDb();
  const err = () => {};
  const coll = (name, key) => db.collection(name).onSnapshot(s => { S[name] = s.docs.map(d => ({ id: d.id, ...d.data() })); S.loaded[key] = true; onData(); }, err);
  coll('atividades', 'a'); coll('metas', 'm'); coll('pessoas', 'p');
  db.collection('reunioes').onSnapshot(s => { S.reunioes = mergeReunioes(s.docs); S.ver++; schedule(); }, err);
  db.doc('config/geral').onSnapshot(s => { S.cfg = { ...DEFAULT_CFG, ...(s.exists ? s.data() : {}) }; S.loaded.c = true; onData(); }, err);
  try { await db.start(); } catch (e) { console.error(e); S.state = 'off'; render(); return; }
  const tick = async () => { if (document.hidden || !sb) return; try { await refreshAccess(); await db.reloadAll(); } catch (e) {} };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
async function refreshAccess() {
  const a = await loadAccess();
  if (!a.prof || !a.prof.ativo) { await sb.auth.signOut(); return; }
  const changed = JSON.stringify(a.lv) !== JSON.stringify(S.lv) || a.prof.role !== S.me.role || a.prof.pessoa_id !== S.me.pessoa_id;
  S.me = a.prof; S.isAdmin = a.prof.role === 'admin'; S.lv = a.lv;
  if (changed) { S.ver++; schedule(); }
}
async function authInit() {
  render();
  if (!window.supabase) { showBlocked('Não foi possível carregar o sistema. Atualize a página.'); return; }
  sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
  let session = null;
  try { session = (await sb.auth.getSession()).data.session; } catch (e) {}
  if (!session) { showLogin(); return; }
  await afterLogin(session);
}
function renderMe() {
  const el = $('#meBox'); if (!el) return;
  if (!S.me) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="me-n">${avatar({ id: S.me.id, nome: S.me.nome }, 'sm')}<div><b>${esc(S.me.nome)}</b><small>${S.isAdmin ? 'Administrador' : 'Usuário'}</small></div></div>
    <div class="me-a"><button class="lnk-l" data-act="chg-pw">Trocar senha</button><button class="lnk-l" data-act="sign-out">Sair</button></div>`;
}

/* ===================== USUÁRIOS E ACESSOS (administrador) ===================== */
const LV = { '': 'Sem acesso', leitor: 'Leitor', responsavel: 'Responsável', gestor: 'Gestor' };
const genPw = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; crypto.getRandomValues(new Uint8Array(10)).forEach(n => s += a[n % a.length]); return s; };
S.adm = { profiles: [], members: [], loaded: false, loading: false, failed: false };
async function loadAdmin(force) {
  if (S.adm.loading) return; S.adm.loading = true; if (force) S.adm.failed = false;
  try {
    const [p, m] = await Promise.all([sb.from('profiles').select('*').order('nome'), sb.from('project_members').select('*')]);
    if (p.error || m.error) throw (p.error || m.error);
    S.adm.profiles = p.data; S.adm.members = m.data; S.adm.loaded = true; S.adm.failed = false;
  } catch (e) { S.adm.failed = true; toast('Não foi possível carregar os usuários.', 'err'); }
  S.adm.loading = false; render();
}
function afterUsuarios() { if (!S.adm.loaded && !S.adm.loading && !S.adm.failed) loadAdmin(); }
function vUsuarios() {
  if (!S.isAdmin) return `<div class="card empty"><h3>Somente administradores</h3></div>`;
  const A = S.adm;
  if (A.failed) return `<div class="card empty"><h3>Não foi possível carregar</h3><div class="row"><button class="btn" data-act="usr-reload">Tentar de novo</button></div></div>`;
  if (!A.loaded) return loadingHTML();
  const rows = A.profiles.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const chips = u => { if (u.role === 'admin') return `<span class="lvchip adm">Todos os projetos</span>`; const ms = A.members.filter(m => m.user_id === u.id); return ms.length ? ms.map(m => { const p = metaById(m.project_id); return `<span class="lvchip lv-${m.level}"><i class="dot" style="background:${p ? metaColor(p) : 'var(--line-2)'}"></i>${esc(p ? p.nome : 'Projeto removido')} · ${LV[m.level]}</span>`; }).join('') : '<span class="muted">Nenhum projeto</span>'; };
  const tb = `<div class="tbl-wrap rise" style="--i:2;max-height:none"><table class="tbl utbl"><thead><tr><th>Usuário</th><th>Perfil</th><th>Responsável vinculado</th><th>Acesso aos projetos</th><th>Situação</th><th></th></tr></thead><tbody>
    ${rows.map(u => { const pe = pessoaById(u.pessoa_id); return `<tr class="row" data-act="usr-edit" data-id="${u.id}" tabindex="0">
      <td><span class="who">${avatar({ id: u.id, nome: u.nome }, '')}<span><b>${esc(u.nome)}</b><div class="muted" style="font-size:12px">${esc(u.email)}</div></span></span></td>
      <td>${u.role === 'admin' ? '<span class="lvchip adm">Administrador</span>' : 'Usuário'}</td>
      <td>${pe ? whoHTML(pe, 'sm') : '<span class="muted">—</span>'}</td>
      <td><div class="lvchips">${chips(u)}</div></td>
      <td>${u.ativo ? '<span class="aptchip ok">Ativo</span>' : '<span class="aptchip">Desativado</span>'}${u.must_change_pw ? '<div class="muted" style="font-size:11.5px;margin-top:4px">senha temporária</div>' : ''}</td>
      <td><div class="qa"><button class="btn sm" data-act="usr-pw" data-id="${u.id}">Redefinir senha</button></div></td></tr>`; }).join('')}
  </tbody></table></div>`;
  return `<div class="dwrap">
    <div class="toolbar rise"><button class="btn primary" data-act="usr-new">${ic('plus')}Novo usuário</button><span class="count-note">${rows.length} ${rows.length === 1 ? 'usuário' : 'usuários'} · ${rows.filter(u => u.ativo).length} ativos</span>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="bk-export">${ic('down')}Baixar backup</button><button class="btn" data-act="bk-import">${ic('up')}Restaurar backup</button></div></div>
    <div class="card rise"><div class="card-h"><h2>Como funcionam os acessos</h2></div>
      <div class="lvhelp-grid"><div><b>Leitor</b><span>Vê o projeto (painel, atividades, cronograma, reunião). Não altera nada.</span></div>
      <div><b>Responsável</b><span>Vê o projeto e lança só nas atividades e etapas em que é o responsável: início, conclusão, avanço e diário. Precisa estar ligado a um responsável cadastrado.</span></div>
      <div><b>Gestor</b><span>Controla o projeto inteiro: atividades, etapas, replanejamentos, diário, reunião e importação.</span></div>
      <div><b>Administrador</b><span>Tudo, em todos os projetos: cria projetos, usuários e acessos.</span></div></div></div>
    ${tb}
    <p class="muted" style="font-size:12.5px;margin:0">Sem acesso a um projeto, o usuário nem sabe que ele existe. As regras valem no servidor, não só na tela. O plano gratuito do banco não faz cópias automáticas: baixe um backup de tempos em tempos.</p></div>`;
}
const matrixHTML = cur => { const ps = [...S.metas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); return ps.length ? ps.map(m => `<div class="mrow"><span class="mchip" style="color:var(--ink)"><i class="dot" style="background:${metaColor(m)}"></i><span>${esc(m.nome)}</span></span>
  <select class="sel lvsel" data-p="${m.id}" aria-label="Acesso a ${esc(m.nome)}">${Object.entries(LV).map(([k, l]) => `<option value="${k}" ${(cur[m.id] || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('') : '<p class="muted" style="margin:0">Nenhum projeto criado ainda.</p>'; };
function openUserModal(uid) {
  const u = uid ? S.adm.profiles.find(p => p.id === uid) : null, self = u && u.id === S.userId;
  const cur = {}; S.adm.members.filter(m => m.user_id === uid).forEach(m => cur[m.project_id] = m.level);
  openModal(`<form id="fu" novalidate><div class="md-h"><h3>${u ? 'Editar usuário' : 'Novo usuário'}</h3><p>${u ? esc(u.email) : 'A pessoa entra com o e-mail e a senha temporária e troca a senha no primeiro acesso.'}</p></div>
    <div class="md-b">
      <div class="cols2"><div class="f"><label for="u-nome">Nome <span class="req">*</span></label><input class="inp" id="u-nome" value="${esc(u ? u.nome : '')}" maxlength="80"></div>
      <div class="f"><label for="u-email">E-mail para entrar <span class="req">*</span></label><input class="inp" type="email" id="u-email" value="${esc(u ? u.email : '')}" ${u ? 'disabled' : ''} autocomplete="off" placeholder="nome@empresa.com.br"></div></div>
      ${u ? '' : `<div class="f"><label for="u-pw">Senha temporária <span class="req">*</span></label><div class="withbtn"><input class="inp mono" id="u-pw" value="${genPw()}" autocomplete="off"><button type="button" class="btn sm" id="u-gen">Gerar outra</button></div></div>`}
      <div class="f"><label for="u-pessoa">Responsável vinculado</label><select class="sel" id="u-pessoa"><option value="">Nenhum</option>${pessoaOptions(u ? u.pessoa_id || '' : '', false)}</select><span class="hint">Obrigatório para o nível “Responsável”: define em quais atividades e etapas a pessoa pode lançar.</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><label class="tog"><input type="checkbox" id="u-admin" ${u && u.role === 'admin' ? 'checked' : ''} ${self ? 'disabled' : ''}>Administrador (acesso total)</label>${u ? `<label class="tog"><input type="checkbox" id="u-ativo" ${u.ativo ? 'checked' : ''} ${self ? 'disabled' : ''}>Usuário ativo</label>` : ''}</div>
      <div class="f" id="u-mx"><span class="lab">Acesso por projeto</span><div class="matrix">${matrixHTML(cur)}</div><span class="hint">Leitor só vê · Responsável lança no que é dele · Gestor controla o projeto inteiro.</span></div>
      <p class="err" id="u-err" role="alert"></p></div>
    <div class="md-f">${u && !self ? `<button type="button" class="btn danger sm" data-act="usr-del" data-id="${u.id}" style="margin-right:auto">${ic('lixo')}Excluir</button>` : ''}<button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">${u ? 'Salvar' : 'Criar usuário'}</button></div></form>`);
  const g = $('#u-gen'); if (g) g.onclick = () => { $('#u-pw').value = genPw(); };
  const tgl = () => { $('#u-mx').style.opacity = $('#u-admin').checked ? '.45' : ''; }; $('#u-admin').addEventListener('change', tgl); tgl();
  $('#fu').addEventListener('submit', async e => {
    e.preventDefault(); const er = m => { $('#u-err').textContent = m; return false; };
    const nome = $('#u-nome').value.trim(), em = $('#u-email').value.trim().toLowerCase(), pes = $('#u-pessoa').value, adm = $('#u-admin').checked;
    const lv = {}; $$('.lvsel').forEach(s => { if (s.value) lv[s.dataset.p] = s.value; });
    if (!nome) return er('Informe o nome.');
    if (!u && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return er('Informe um e-mail válido.');
    const pw = u ? null : $('#u-pw').value; if (!u && pw.length < 8) return er('A senha temporária precisa ter pelo menos 8 caracteres.');
    if (!adm && Object.values(lv).includes('responsavel') && !pes) return er('Para o nível “Responsável” é preciso vincular um responsável cadastrado.');
    const btn = e.submitter || $('#fu button[type=submit]'); btn.disabled = true;
    try {
      let id = uid;
      if (!u) { const r = await sb.rpc('admin_create_user', { p_email: em, p_nome: nome, p_senha: pw, p_pessoa: pes || null, p_admin: adm }); if (r.error) throw r.error; id = r.data; }
      else { const r = await sb.from('profiles').update({ nome, pessoa_id: pes || null, role: adm ? 'admin' : 'user', ativo: self ? true : $('#u-ativo').checked }).eq('id', id); if (r.error) throw r.error; }
      const had = { ...cur }, rem = Object.keys(had).filter(p => !lv[p]), rows = Object.entries(lv).filter(([p, l]) => had[p] !== l).map(([project_id, level]) => ({ project_id, user_id: id, level }));
      if (rem.length) { const r = await sb.from('project_members').delete().eq('user_id', id).in('project_id', rem); if (r.error) throw r.error; }
      if (rows.length) { const r = await sb.from('project_members').upsert(rows, { onConflict: 'project_id,user_id' }); if (r.error) throw r.error; }
      await loadAdmin(true);
      if (!u) showCredentials(nome, em, pw); else { closeModal(); toast('Usuário atualizado.', 'ok'); }
    } catch (x) { btn.disabled = false; er(/já está cadastrado/i.test(x.message || '') ? 'Este e-mail já está cadastrado.' : (x.message || 'Não foi possível salvar.')); }
  });
}
function showCredentials(nome, email, pw, reset) {
  const txt = `Acesso ao Controle de Projetos\nEndereço: ${location.origin}\nE-mail: ${email}\nSenha temporária: ${pw}\n(você troca a senha no primeiro acesso)`;
  openModal(`<div class="md-h"><h3>${reset ? 'Senha redefinida' : 'Usuário criado'}</h3><p>${esc(nome)} entra com os dados abaixo e troca a senha no primeiro acesso. Esta senha não será mostrada de novo.</p></div>
    <div class="md-b"><pre class="credbox" id="cred">${esc(txt)}</pre></div>
    <div class="md-f"><button type="button" class="btn" id="cred-copy">Copiar dados</button><button type="button" class="btn primary" data-act="close-modal">Concluir</button></div>`);
  $('#cred-copy').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Copiado.', 'ok'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#cred')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selecione e copie (Ctrl+C).', ''); } };
}
function openResetPw(uid) {
  const u = S.adm.profiles.find(p => p.id === uid); if (!u) return;
  openModal(`<form id="frs" novalidate><div class="md-h"><h3>Redefinir senha</h3><p>${esc(u.nome)} · ${esc(u.email)}. A pessoa será desconectada e precisará trocar a senha ao entrar.</p></div>
    <div class="md-b"><div class="f"><label for="rs-pw">Nova senha temporária</label><div class="withbtn"><input class="inp mono" id="rs-pw" value="${genPw()}" autocomplete="off"><button type="button" class="btn sm" id="rs-gen">Gerar outra</button></div></div><p class="err" id="rs-err" role="alert"></p></div>
    <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">Redefinir</button></div></form>`);
  $('#rs-gen').onclick = () => { $('#rs-pw').value = genPw(); };
  $('#frs').addEventListener('submit', async e => {
    e.preventDefault(); const pw = $('#rs-pw').value; if (pw.length < 8) { $('#rs-err').textContent = 'Use pelo menos 8 caracteres.'; return; }
    const r = await sb.rpc('admin_set_password', { p_user: uid, p_senha: pw }); if (r.error) { $('#rs-err').textContent = r.error.message; return; }
    await loadAdmin(true); showCredentials(u.nome, u.email, pw, true);
  });
}
async function deleteUser(uid, btn) {
  const u = S.adm.profiles.find(p => p.id === uid); if (!u) return;
  if (!armed(btn, 'Confirmar exclusão')) return;
  const r = await sb.rpc('admin_delete_user', { p_user: uid }); if (r.error) { toast(r.error.message, 'err'); return; }
  closeModal(); await loadAdmin(true); toast(`${u.nome} excluído(a).`, '');
}

/* ---------- backup e restauração (administrador) ---------- */
async function exportBackup() {
  const t = toast('Gerando backup…', '', null, null, 60000);
  try {
    const docs = []; let from = 0;
    for (;;) { const { data, error } = await sb.from('docs').select('coll,id,data').order('coll').order('id').range(from, from + 999); if (error) throw error; docs.push(...data); if (data.length < 1000) break; from += 1000; }
    const out = { versao: 1, origem: 'Controle de Projetos', geradoEm: ISO(today()), docs };
    await downloads.save({ filename: `backup-controle-de-projetos-${ISO(today())}.json`, data: new Blob([JSON.stringify(out)], { type: 'application/json' }) });
    dismissToast(t); toast(`Backup gerado: ${docs.length} registros.`, 'ok');
  } catch (e) { dismissToast(t); toast('Não foi possível gerar o backup.', 'err'); }
}
function openRestore() {
  openModal(`<div class="md-h"><h3>Restaurar backup</h3><p>Escolha um arquivo de backup (.json). Os registros do arquivo são gravados por cima dos que têm o mesmo identificador; nada é apagado.</p></div>
    <div class="md-b" id="rs-b"><label class="drop" id="rs-drop">${ic('up')}<b>Arraste o arquivo aqui ou clique para escolher</b><input type="file" id="rs-file" accept=".json,application/json"></label><p class="err" id="rs-err" role="alert"></p></div><div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button></div>`);
  const pick = async f => {
    const er = $('#rs-err'); er.textContent = '';
    try {
      const j = JSON.parse(await f.text()); if (!j || !Array.isArray(j.docs)) throw 0;
      const docs = j.docs.filter(d => d && d.coll && d.id && d.data && typeof d.data === 'object' && ['atividades', 'metas', 'pessoas', 'reunioes', 'eventos', 'config'].includes(d.coll));
      if (!docs.length) throw 0;
      const cnt = {}; docs.forEach(d => cnt[d.coll] = (cnt[d.coll] || 0) + 1);
      $('#rs-b').innerHTML = `<p><b>${docs.length} registros</b> encontrados:</p><ul class="rs-list">${Object.entries(cnt).map(([k, n]) => `<li>${n} ${({ atividades: 'atividades', metas: 'projetos', pessoas: 'responsáveis', reunioes: 'reuniões fechadas', eventos: 'eventos do histórico', config: 'configuração' })[k]}</li>`).join('')}</ul><div class="pbar"><i id="rs-pb"></i></div><p class="muted" id="rs-st" style="font-size:12.5px"></p>`;
      $('#modal .md-f').innerHTML = `<button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="button" class="btn primary" id="rs-go">Restaurar agora</button>`;
      $('#rs-go').onclick = async () => {
        $('#rs-go').disabled = true; const order = ['config', 'metas', 'pessoas', 'atividades', 'reunioes', 'eventos'];
        docs.sort((a, b) => order.indexOf(a.coll) - order.indexOf(b.coll)); let done = 0, bad = 0;
        for (let i = 0; i < docs.length; i += 6) {
          await Promise.all(docs.slice(i, i + 6).map(async d => { try { await db.doc(d.coll + '/' + d.id).set(d.data); done++; } catch (e) { bad++; } }));
          $('#rs-pb').style.width = ((i + 6) / docs.length * 100).toFixed(0) + '%'; $('#rs-st').textContent = `${Math.min(done + bad, docs.length)} de ${docs.length}…`;
        }
        try { await db.reloadAll(); } catch (e) {}
        $('#rs-b').innerHTML = `<div class="empty" style="padding:14px 0"><h3>${bad ? 'Restauração com avisos' : 'Restauração concluída'}</h3><p>${done} registros gravados${bad ? ` · ${bad} não puderam ser gravados` : ''}.</p></div>`;
        $('#modal .md-f').innerHTML = `<button type="button" class="btn primary" data-act="close-modal">Fechar</button>`; if (done) celebrate();
      };
    } catch (e) { er.textContent = 'Este arquivo não parece ser um backup válido.'; }
  };
  const inp = $('#rs-file'), dr = $('#rs-drop');
  inp.addEventListener('change', () => inp.files[0] && pick(inp.files[0]));
  ['dragover', 'dragenter'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.remove('over'); }));
  dr.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) pick(f); });
}

/* ---------- fechar reunião: uma foto por projeto que a pessoa gerencia ---------- */
async function closeMeeting() {
  const T = today(), pids = (S.proj ? [S.proj] : S.metas.map(m => m.id)).filter(p => p !== '_none' && canManage(p));
  if (!pids.length) { toast('Você não gerencia nenhum projeto.', 'warn'); return; }
  let n = 0;
  for (const pid of pids) {
    const fotos = {};
    allActs().filter(x => x.a.metaId === pid).forEach(x => {
      const subs = {}; subsOf(x.a).forEach((s, i) => { const k = (x.c.subs || [])[i]; if (k) subs[s.id] = { s: k.status, p: Math.round(k.prog || 0) }; });
      fotos[x.a.id] = { s: x.c.status, p: Math.round(x.c.done ? 100 : x.c.prog ?? 0), ip: ISO(x.c.ip), fp: ISO(x.c.fp), ir: ISO(x.c.ir), fr: ISO(x.c.fr), subs };
    });
    const ok = await write(() => db.doc('reunioes/' + ISO(T) + '__' + pid).set({ data: ISO(T), projetoId: pid, fechadaEm: nowISO(), por: S.userId || '', fotos, projetos: { [pid]: Math.round(metaStats(pid, allActs()).prog) } }), true);
    if (ok) n++;
  }
  if (n) { logEvt('reuniao', S.proj ? { metaId: S.proj } : null, `Reunião de ${fds(T)} fechada${S.proj ? '' : ' (' + n + ' projetos)'}`); toast(`Reunião de ${fds(T)} fechada em ${n} ${n === 1 ? 'projeto' : 'projetos'}. A próxima vai comparar com hoje.`, 'ok'); }
  else toast('Não foi possível fechar a reunião.', 'err');
}
