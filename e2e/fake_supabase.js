// Simulação em memória do cliente Supabase (para testar a interface sem rede)
(function () {
  const SEED = window.__SEED__;
  const T = { docs: [], profiles: [], project_members: [] };
  SEED.docs.forEach(d => T.docs.push({ coll: d.coll, id: d.id, data: JSON.parse(JSON.stringify(d.data)), version: 1 }));
  const metas = SEED.docs.filter(d => d.coll === 'metas').map(d => d.id), FUP = 'q5xvihq5ti1zoqd8g39d', OWNER = 'nlxf5323v1qa1f65bhef';
  T.profiles = [
    { id: 'u-admin', email: 'admin@teste.com', nome: 'Administrador', role: 'admin', ativo: true, pessoa_id: null, must_change_pw: false },
    { id: 'u-gest', email: 'gestor@teste.com', nome: 'Gestora FUP', role: 'user', ativo: true, pessoa_id: null, must_change_pw: false },
    { id: 'u-resp', email: 'resp@teste.com', nome: 'Responsável FUP', role: 'user', ativo: true, pessoa_id: OWNER, must_change_pw: false },
    { id: 'u-leit', email: 'leitor@teste.com', nome: 'Leitor FUP', role: 'user', ativo: true, pessoa_id: null, must_change_pw: false },
    { id: 'u-novo', email: 'novo@teste.com', nome: 'Pessoa Nova', role: 'user', ativo: true, pessoa_id: null, must_change_pw: true },
    { id: 'u-off', email: 'off@teste.com', nome: 'Desativado', role: 'user', ativo: false, pessoa_id: null, must_change_pw: false },
  ];
  T.project_members = [{ project_id: FUP, user_id: 'u-gest', level: 'gestor' }, { project_id: FUP, user_id: 'u-resp', level: 'responsavel' }, { project_id: FUP, user_id: 'u-leit', level: 'leitor' }, { project_id: metas.find(m => m !== FUP), user_id: 'u-gest', level: 'leitor' }];
  const projOf = r => r.coll === 'metas' ? r.id : r.coll === 'atividades' || r.coll === 'eventos' ? (r.data.metaId || null) : r.coll === 'reunioes' ? (r.data.projetoId || null) : null;
  let me = null; window.__LOG__ = [];
  const listeners = [];
  const visible = r => { const p = T.profiles.find(x => x.id === me); if (!p || !p.ativo) return false; if (p.role === 'admin') return true; if (r.coll === 'pessoas' || r.coll === 'config') return true; const pr = projOf(r); return !!pr && T.project_members.some(m => m.user_id === me && m.project_id === pr); };
  function builder(table) {
    const q = { table, f: [], order: null, range: null, lim: null, op: 'select', payload: null, single: false, conflict: null };
    const b = {
      select() { return b; }, eq(c, v) { q.f.push(r => r[c] === v); return b; }, in(c, vs) { q.f.push(r => vs.includes(r[c])); return b; },
      gte(c, v) { q.f.push(r => get(r, c) >= v); return b; }, lte(c, v) { q.f.push(r => get(r, c) <= v); return b; },
      order(c, o) { q.order = [c, !(o && o.ascending === false)]; return b; }, range(a, z) { q.range = [a, z]; return b; }, limit(n) { q.lim = n; return b; },
      maybeSingle() { q.single = true; return b; }, update(p) { q.op = 'update'; q.payload = p; return b; }, delete() { q.op = 'delete'; return b; }, upsert(p, o) { q.op = 'upsert'; q.payload = p; q.conflict = o; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    const get = (r, c) => c.startsWith('data->>') ? r.data[c.slice(7)] : r[c];
    function run() {
      const p = T.profiles.find(x => x.id === me); let rows = T[table];
      if (table === 'profiles' && !(p && p.role === 'admin')) rows = rows.filter(r => r.id === me);
      if (table === 'project_members' && !(p && p.role === 'admin')) rows = rows.filter(r => r.user_id === me);
      if (table === 'docs') rows = rows.filter(visible);
      rows = rows.filter(r => q.f.every(f => f(r)));
      if (q.op === 'delete') { T[table] = T[table].filter(r => !rows.includes(r)); return { data: null, error: null }; }
      if (q.op === 'update') { rows.forEach(r => Object.assign(r, q.payload)); return { data: null, error: null }; }
      if (q.op === 'upsert') { (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach(x => { const ex = T[table].find(r => r.project_id === x.project_id && r.user_id === x.user_id); if (ex) Object.assign(ex, x); else T[table].push(x); }); return { data: null, error: null }; }
      if (q.order) { const [c, asc] = q.order; rows = rows.slice().sort((a, b) => (get(a, c) > get(b, c) ? 1 : -1) * (asc ? 1 : -1)); }
      if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1); if (q.lim) rows = rows.slice(0, q.lim);
      const out = rows.map(r => JSON.parse(JSON.stringify(r)));
      return q.single ? { data: out[0] || null, error: null } : { data: out, error: null };
    }
    return b;
  }
  const fnErr = m => ({ data: null, error: { message: m, code: 'P0001' } });
  function rpc(name, a) {
    window.__LOG__.push(['rpc', name, a && a.p_coll ? a.p_coll + '/' + a.p_id : '']);
    const p = T.profiles.find(x => x.id === me);
    if (name === 'doc_set') { const ex = T.docs.find(r => r.coll === a.p_coll && r.id === a.p_id); if (ex) ex.data = a.p_data; else T.docs.push({ coll: a.p_coll, id: a.p_id, data: a.p_data, version: 1 }); return { data: null, error: null }; }
    if (name === 'doc_patch') { const ex = T.docs.find(r => r.coll === a.p_coll && r.id === a.p_id); if (!ex) return fnErr('Documento não encontrado ou sem permissão.'); Object.assign(ex.data, a.p_patch); return { data: null, error: null }; }
    if (name === 'doc_delete') { T.docs = T.docs.filter(r => !(r.coll === a.p_coll && r.id === a.p_id)); return { data: null, error: null }; }
    if (name === 'get_nomes') return { data: T.profiles.filter(x => x.ativo).map(x => ({ id: x.id, nome: x.nome })), error: null };
    if (name === 'me_password_changed') { p.must_change_pw = false; return { data: null, error: null }; }
    if (name === 'admin_create_user') { const id = 'u-' + Math.random().toString(36).slice(2, 7); T.profiles.push({ id, email: a.p_email, nome: a.p_nome, role: a.p_admin ? 'admin' : 'user', ativo: true, pessoa_id: a.p_pessoa, must_change_pw: true }); return { data: id, error: null }; }
    if (name === 'admin_set_password') return { data: null, error: null };
    if (name === 'admin_delete_user') { T.profiles = T.profiles.filter(x => x.id !== a.p_user); return { data: null, error: null }; }
    return fnErr('rpc desconhecida ' + name);
  }
  window.__T__ = T;
  window.supabase = { createClient() {
    return {
      from: builder, rpc: (n, a) => Promise.resolve(rpc(n, a)),
      channel() { const c = { on() { return c; }, subscribe() { return c; } }; return c; }, removeChannel() {},
      auth: {
        async getSession() { const u = sessionStorage.getItem('fake-user'); return { data: { session: u ? { user: { id: u } } : null } }; },
        async signInWithPassword({ email, password }) { const p = T.profiles.find(x => x.email === email); if (!p || password !== 'senha1234') return { data: null, error: { message: 'Invalid login credentials' } }; me = p.id; sessionStorage.setItem('fake-user', p.id); return { data: { session: { user: { id: p.id } } }, error: null }; },
        async updateUser({ password }) { return { error: null }; },
        async signOut() { sessionStorage.removeItem('fake-user'); listeners.forEach(f => f('SIGNED_OUT')); },
        onAuthStateChange(cb) { listeners.push(cb); },
      },
    };
  } };
  const u = sessionStorage.getItem('fake-user'); if (u) me = u;
})();
