// Simulação em memória do cliente Supabase (para testar a interface sem rede)
(function () {
  const SEED = window.__SEED__;
  const T = { docs: [], profiles: [], project_members: [], user_state: [], fin_contratos: [], fin_itens: [], fin_log: [], backups: [], fin_valores: [] };
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
  if (window.__FIN_DEMO__) {
    const m = T.docs.find(d => d.coll === 'metas' && d.id === FUP); if (m) m.data.financeiro = true;
    T.fin_contratos.push({ project_id: FUP, valor: 480000, obs: 'Contrato 045/2026' });
    T.docs.filter(d => d.coll === 'atividades' && d.data.respId === OWNER && !d.data.fimReal).slice(0, 2).forEach((d, i) => { d.data.atribuidoEm = new Date(Date.now() - i * 3600e3).toISOString(); d.data.atribuidoPor = 'u-gest'; });
    T.project_members.push({ project_id: FUP, user_id: 'u-leit', level: 'leitor', fin: false }); T.project_members.find(m => m.user_id === 'u-gest' && m.project_id === FUP).fin = true;
    [['pagamento', '2026-10-05', 'Medição 1', 'Medição 1', '', 60000], ['pagamento', '2026-10-30', 'Medição 2', 'Medição 2', '', 85000], ['fd', '2026-10-12', 'Compra de 500 tijolos', 'Cerâmica Bom Jesus', '4471', 1250], ['fd', '2026-10-20', 'Cimento CP-II (80 sacos)', 'Depósito Central', '9902', 3120], ['aditivo', '2026-10-25', 'Aditivo 1 · troca de quadro elétrico', 'Termo aditivo 1', '', 18000]]
      .forEach(([tipo, data, descricao, fornecedor, nf, valor], i) => T.fin_itens.push({ id: 'fi-' + i, project_id: FUP, tipo, data, descricao, fornecedor, nf, valor, created_at: data + 'T12:00:00Z' }));
  }
  if (window.__DAILY__) {
    // projeto no modo diário com uma atividade e uma etapa que terminam depois de hoje
    const iso = n => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const m = T.docs.find(d => d.coll === 'metas' && d.id === FUP); m.data.modoDiario = true; m.data.diasUteis = false;
    T.docs.push({ coll: 'atividades', id: 'act-early', data: { codigo: 'ATV-900', titulo: 'Pintura antecipada', metaId: FUP, respId: OWNER, peso: 1, iniPlan: iso(-2), fimPlan: iso(2), iniOrig: iso(-2), fimOrig: iso(2), iniReal: iso(-2), fimReal: '', progresso: null, diario: { [iso(-2)]: 100, [iso(-1)]: 100 }, replans: [], criadoEm: iso(-3) + 'T10:00:00Z' } });
    T.docs.push({ coll: 'atividades', id: 'act-fut', data: { codigo: 'ATV-902', titulo: 'Revestimento adiantável', metaId: FUP, respId: OWNER, peso: 1, iniPlan: iso(3), fimPlan: iso(6), iniOrig: iso(3), fimOrig: iso(6), iniReal: '', fimReal: '', progresso: null, diario: {}, replans: [], criadoEm: iso(-3) + 'T10:00:00Z' } });
    T.docs.push({ coll: 'atividades', id: 'act-et', data: { codigo: 'ATV-901', titulo: 'Montagem com etapas', metaId: FUP, respId: OWNER, peso: 1, iniPlan: iso(-2), fimPlan: iso(3), iniOrig: iso(-2), fimOrig: iso(3), iniReal: iso(-2), iniAuto: true, fimReal: '', progresso: null, replans: [], criadoEm: iso(-3) + 'T10:00:00Z',
      etapas: [{ id: 'e1', nome: 'Base', respId: '', peso: 1, iniPlan: iso(-2), fimPlan: iso(1), iniOrig: iso(-2), fimOrig: iso(1), iniReal: iso(-2), fimReal: '', diario: { [iso(-2)]: 100, [iso(-1)]: 100 }, replans: [], criadoEm: iso(-3) + 'T10:00:00Z' },
               { id: 'e2', nome: 'Acabamento', respId: '', peso: 1, iniPlan: iso(2), fimPlan: iso(3), iniOrig: iso(2), fimOrig: iso(3), iniReal: '', fimReal: '', diario: {}, replans: [], criadoEm: iso(-3) + 'T10:00:00Z' }] } });
  }
  const canFin = pid => { const p = T.profiles.find(x => x.id === me); return !!p && p.ativo && (p.role === 'admin' || T.project_members.some(m => m.user_id === me && m.project_id === pid && m.fin)); };
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
      maybeSingle() { q.single = true; return b; }, update(p) { q.op = 'update'; q.payload = p; return b; }, delete() { q.op = 'delete'; return b; }, upsert(p, o) { q.op = 'upsert'; q.payload = p; q.conflict = o; return b; }, insert(p) { q.op = 'insert'; q.payload = p; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    const get = (r, c) => c.startsWith('data->>') ? r.data[c.slice(7)] : r[c];
    function run() {
      const p = T.profiles.find(x => x.id === me); let rows = T[table];
      if (table === 'profiles' && !(p && p.role === 'admin')) rows = rows.filter(r => r.id === me);
      if (table === 'project_members' && !(p && p.role === 'admin')) rows = rows.filter(r => r.user_id === me);
      if (table === 'docs') rows = rows.filter(visible);
      if (table.startsWith('fin_')) rows = rows.filter(r => canFin(r.project_id));
      if (table === 'user_state') rows = rows.filter(r => r.user_id === me);
      if (table === 'backups' && !(p && p.role === 'admin')) rows = [];
      const flog = (acao, r) => { if (table.startsWith('fin_') && table !== 'fin_log') T.fin_log.unshift({ id: T.fin_log.length + 1, project_id: r.project_id, acao, tipo: table === 'fin_itens' ? r.tipo : table === 'fin_valores' ? 'valor' : 'contrato', item: JSON.parse(JSON.stringify(r)), por: me, em: new Date().toISOString() }); };
      if (q.op === 'insert') { (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach(x => { if (table.startsWith('fin_') && !canFin(x.project_id)) throw new Error('rls'); const r = { id: 'fi-' + Math.random().toString(36).slice(2, 8), created_at: new Date().toISOString(), ...x }; T[table].push(r); flog('insert', r); }); return { data: null, error: null }; }
      rows = rows.filter(r => q.f.every(f => f(r)));
      if (q.op === 'delete') { rows.forEach(r => flog('delete', r)); T[table] = T[table].filter(r => !rows.includes(r)); return { data: null, error: null }; }
      if (q.op === 'update') { rows.forEach(r => { Object.assign(r, q.payload); flog('update', r); }); return { data: null, error: null }; }
      if (q.op === 'upsert') { const keys = (q.conflict && q.conflict.onConflict ? q.conflict.onConflict : 'project_id,user_id').split(','); (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach(x => { const ex = T[table].find(r => keys.every(k => r[k] === x[k])); if (ex) Object.assign(ex, x); else T[table].push({ ...x }); flog(ex ? 'update' : 'insert', ex || x); }); return { data: null, error: null }; }
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
    if (name === 'fin_resumo') { const it = T.fin_itens.filter(i => i.project_id === a.pid), sum = t => it.filter(i => i.tipo === t).reduce((s, i) => s + +i.valor, 0), c = T.fin_contratos.find(x => x.project_id === a.pid);
      const pg = {}; it.filter(i => i.tipo === 'pagamento').forEach(i => pg[i.data] = (pg[i.data] || 0) + +i.valor);
      return { data: { contrato: c ? +c.valor : 0, aditivos: sum('aditivo'), fd: sum('fd'), pago: sum('pagamento'), itens: it.length, pagamentos: Object.keys(pg).sort().map(d => ({ d, v: pg[d] })) }, error: null }; }
    if (name === 'fazer_backup') { if (!p || p.role !== 'admin') return fnErr('Apenas administradores.'); const id = T.backups.length + 1; T.backups.unshift({ id, criado_em: new Date().toISOString(), origem: 'manual', registros: T.docs.length + T.fin_itens.length, dados: { versao: 2, docs: T.docs.map(d => ({ coll: d.coll, id: d.id, data: d.data })), fin_itens: T.fin_itens, fin_contratos: T.fin_contratos } }); return { data: id, error: null }; }
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
