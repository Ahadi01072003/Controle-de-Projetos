/* ===================== V2: avisos, minhas atividades, produtividade, pessoas e navegação ===================== */
// Avisos de atribuição só valem para o que foi atribuído a partir desta versão (evita uma enxurrada no primeiro acesso).
const ALERT_START = '2026-11-10T00:00:00Z';
const myPessoaSafe = () => (S.me && S.me.pessoa_id) || null;
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
const fdTs = ts => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

/* ---------- estado por usuário (avisos lidos), guardado no banco ---------- */
S.ust = { lidas: {} }; S.ustLoaded = false;
let ustT = 0;
async function loadUserState() {
  try { const { data } = await sb.from('user_state').select('data').eq('user_id', S.userId).maybeSingle(); S.ust = { lidas: {}, ...((data && data.data) || {}) }; } catch (e) {}
  S.ustLoaded = true; S.ver++; schedule();
}
function saveUserState() {
  clearTimeout(ustT);
  ustT = setTimeout(async () => { try { await sb.from('user_state').upsert({ user_id: S.userId, data: S.ust, updated_at: nowISO() }, { onConflict: 'user_id' }); } catch (e) {} }, 600);
}

/* ---------- apoio (pessoas que ajudam numa atividade) ---------- */
function apoioPicker(sel, respId, dis) {
  const ps = [...S.pessoas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const chosen = ps.filter(p => sel.includes(p.id));
  return `<details class="msel" id="a-apoio" ${dis ? 'data-dis="1"' : ''}><summary class="sel">${chosen.length ? chosen.map(p => esc(p.nome)).join(', ') : '<span class="muted">Ninguém no apoio</span>'}</summary>
    <div class="msel-b">${ps.length ? ps.map(p => `<label class="msel-o"><input type="checkbox" value="${p.id}" ${sel.includes(p.id) ? 'checked' : ''} ${dis}>${avatar(p, 'sm')}<span>${esc(p.nome)}</span></label>`).join('') : '<span class="muted">Nenhuma pessoa cadastrada.</span>'}</div></details>`;
}
function apoioTag(a) {
  const ids = (a.apoioIds || []).filter(id => id !== a.respId), ps = ids.map(pessoaById).filter(Boolean);
  return ps.length ? `<span class="aptag" data-tip="Apoio: ${esc(ps.map(p => p.nome).join(', '))}">+${ps.length} apoio</span>` : '';
}
document.addEventListener('change', e => {
  const d = e.target.closest && e.target.closest('#a-apoio');
  if (d) { const names = $$('input:checked', d).map(i => (pessoaById(i.value) || {}).nome).filter(Boolean); d.querySelector('summary').innerHTML = names.length ? esc(names.join(', ')) : '<span class="muted">Ninguém no apoio</span>'; }
});

/* ---------- avisos ---------- */
let alMemo = { k: '', list: [] };
const stKind = st => st === 'atrasada' || st === 'inicio_atrasado' ? 'atraso' : st === 'risco' ? 'risco' : null;
function alerts() {
  if (S.state !== 'ready' || !S.ustLoaded) return [];
  const k = S.ver + '|' + today() + '|' + (S.ust.v || 0);
  if (alMemo.k === k) return alMemo.list;
  const me = myPessoaSafe(), out = [];
  allActs().forEach(x => {
    const a = x.a, pid = a.metaId;
    if (!pid || !metaById(pid) || x.c.canc || a.manual === 'pausada') return;
    const gest = canManage(pid), mineA = !!me && a.respId === me, apoio = !!me && (a.apoioIds || []).includes(me) && !mineA;
    const subs = subsOf(a), sc = x.c.subs || [];
    // atribuições novas (a principal)
    if ((mineA || apoio) && !x.c.done) {
      const ts = a.atribuidoEm || a.criadoEm || '';
      if (ts >= ALERT_START && (a.atribuidoPor || a.criadoPor) !== S.userId) out.push({ k: `n:${a.id}:${ts}`, t: 'nova', x, ts, apoio });
    }
    subs.forEach((s, i) => {
      if (!me || s.respId !== me || mineA || !sc[i] || sc[i].done) return;
      const ts = s.atribuidoEm || s.criadoEm || '';
      if (ts >= ALERT_START && (s.atribuidoPor || '') !== S.userId) out.push({ k: `n:${a.id}:${s.id}:${ts}`, t: 'nova', x, s, si: i, ts });
    });
    // atraso e risco: o que é meu e, para gestores, o projeto inteiro
    let personal = false;
    if (subs.length) subs.forEach((s, i) => { const c = sc[i]; if (!c || !me || (s.respId || a.respId) !== me) return; const t = stKind(c.status); if (t) { personal = true; out.push({ k: `${t}:${a.id}:${s.id}:${c.status}`, t, x, s, si: i, st: c.status, d: c.fp }); } });
    else if (mineA) { const t = stKind(x.c.status); if (t) { personal = true; out.push({ k: `${t}:${a.id}::${x.c.status}`, t, x, st: x.c.status, d: x.c.fp }); } }
    if (gest && !personal) { const t = stKind(x.c.status); if (t) out.push({ k: `${t}:${a.id}::${x.c.status}`, t, x, st: x.c.status, d: x.c.fp, gest: true }); }
  });
  const L = S.ust.lidas || {};
  out.forEach(o => { o.lida = !!L[o.k]; });
  out.sort((a, b) => (a.lida - b.lida) || (a.t === 'nova' && b.t === 'nova' ? String(b.ts).localeCompare(String(a.ts)) : (a.d ?? 0) - (b.d ?? 0)));
  alMemo = { k, list: out };
  return out;
}
function markRead(keys) {
  const all = alerts(), live = new Set(all.map(o => o.k)), L = {};
  for (const k in (S.ust.lidas || {})) if (live.has(k)) L[k] = S.ust.lidas[k]; // descarta avisos que já não existem
  keys.forEach(k => { L[k] = nowISO(); });
  S.ust = { ...S.ust, lidas: L, v: (S.ust.v || 0) + 1 };
  saveUserState(); renderBell();
}
function renderBell() {
  const b = $('#btnBell'); if (!b) return;
  const ready = S.state === 'ready' && S.ustLoaded; b.hidden = !ready; if (!ready) return;
  const L = alerts(), un = L.filter(o => !o.lida), n = un.length, bd = $('#bellN');
  bd.hidden = !n; bd.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('has', n > 0); b.setAttribute('aria-label', n ? `Avisos: ${n} não lidos` : 'Avisos');
  const novas = un.filter(o => o.t === 'nova');
  if (S.alSeen) {
    const fresh = novas.filter(o => !S.alSeen.has(o.k));
    if (fresh.length) {
      if (!REDUCED) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
      const o = fresh[0];
      toast(fresh.length > 1 ? `${fresh.length} novas atividades para você.` : `Nova ${o.s ? 'etapa' : 'atividade'} para você: ${o.s ? o.s.nome : o.x.a.titulo}`, 'ok', 'Abrir', () => openAlert(o.k), 9000);
    }
  }
  S.alSeen = new Set([...(S.alSeen || []), ...novas.map(o => o.k)]);
  if (!$('#bellPop').hidden) renderBellPop();
}
S.bellTab = 'nova';
function renderBellPop() {
  const L = alerts(), el = $('#bellPop');
  const tabs = [['nova', 'Novas para você'], ['atraso', 'Atrasadas'], ['risco', 'Em risco']];
  const un = t => L.filter(o => o.t === t && !o.lida).length;
  const list = L.filter(o => o.t === S.bellTab);
  const empty = { nova: myPessoaSafe() ? 'Nenhuma atividade nova atribuída a você.' : 'Seu usuário não está ligado a um responsável, então não recebe atribuições.', atraso: 'Nada atrasado. Bom trabalho.', risco: 'Nada em risco agora.' }[S.bellTab];
  const row = o => {
    const a = o.x.a, m = o.x.m, nm = o.s ? o.s.nome : a.titulo;
    const sub = o.t === 'nova'
      ? `${o.apoio ? 'Você está no apoio · ' : ''}${o.s ? 'etapa de ' + esc(a.titulo) + ' · ' : ''}prazo ${fds(o.s ? P(o.s.iniPlan) : o.x.c.ip)} → ${fds(o.s ? P(o.s.fimPlan) : o.x.c.fp)}`
      : `${o.gest ? esc(o.x.p ? o.x.p.nome : 'Sem responsável') + ' · ' : ''}${ST[o.st].l}${o.st === 'inicio_atrasado' ? ' · começo previsto ' + fds(o.s ? P(o.s.iniPlan) : o.x.c.ip) : ' · vence ' + fds(o.d)}`;
    return `<li class="al ${o.lida ? '' : 'un'}" data-act="al-open" data-k="${esc(o.k)}" tabindex="0">
      <i class="al-ic al-${o.t}">${ic(o.t === 'nova' ? 'plus' : o.t === 'atraso' ? 's_late' : 's_alert')}</i>
      <div class="al-b"><div class="al-t">${o.s ? etBadge(o.si + 1) : ''}${esc(nm)}</div><div class="al-s"><i class="dot" style="background:${metaColor(m)};border-radius:2px"></i>${esc(m ? m.nome : '')}${o.t === 'nova' ? ' · ' + fdTs(o.ts) : ''}</div><div class="al-s">${sub}</div></div>
      ${o.lida ? '' : `<button class="al-x" data-act="al-read" data-k="${esc(o.k)}" aria-label="Marcar como lido" data-tip="Marcar como lido">${ic('check')}</button>`}</li>`;
  };
  el.innerHTML = `<div class="pop-h"><b>Avisos</b>${L.some(o => !o.lida) ? '<button class="lnk" data-act="al-all">Marcar todos como lidos</button>' : ''}<button class="btn icon ghost sm" data-act="pop-close" aria-label="Fechar">${ic('fechar')}</button></div>
    <div class="pop-tabs" role="tablist">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${S.bellTab === t}" class="${S.bellTab === t ? 'on' : ''}" data-act="al-tab" data-t="${t}">${l}${un(t) ? `<b>${un(t)}</b>` : ''}</button>`).join('')}</div>
    <div class="pop-b">${list.length ? `<ul class="al-list">${list.map(row).join('')}</ul>` : `<p class="muted pop-empty">${empty}</p>`}</div>
    ${myPessoaSafe() ? `<div class="pop-f"><a href="#minhas" data-act="pop-close-go">Ver todas as minhas atividades ${ic('seta')}</a></div>` : ''}`;
}
function openBell() {
  const el = $('#bellPop'), b = $('#btnBell');
  if (!el.hidden) { closePops(); return; }
  closePops();
  const L = alerts(); if (!L.some(o => o.t === S.bellTab && !o.lida)) { const t = ['nova', 'atraso', 'risco'].find(t => L.some(o => o.t === t && !o.lida)); if (t) S.bellTab = t; }
  renderBellPop(); el.hidden = false; b.setAttribute('aria-expanded', 'true');
  const r = b.getBoundingClientRect();
  if (innerWidth > 600) { el.style.top = (r.bottom + 8) + 'px'; el.style.right = Math.max(8, innerWidth - r.right) + 'px'; el.style.left = ''; }
  else { el.style.top = (r.bottom + 8) + 'px'; el.style.left = '8px'; el.style.right = '8px'; }
  requestAnimationFrame(() => el.classList.add('on'));
}
function openAlert(k) {
  const o = alerts().find(z => z.k === k); if (!o) return;
  markRead([k]); closePops();
  openActAt(o.x.a.id, o.s ? o.s.id : null);
}
function openActAt(id, sid) {
  const a = findAct(id); if (!a) return;
  const h = projHash('atividades', a.metaId || '_none');
  const go2 = () => { openAct(id); if (sid) setTimeout(() => focusSub(sid), 380); };
  if (location.hash.slice(1) !== h && S.view !== 'minhas') { location.hash = h; setTimeout(go2, 140); } else go2();
}
function focusSub(sid) {
  const el = $(`#a-subs [data-sid="${CSS.escape(sid)}"]`); if (!el) return;
  const row = el.closest('tr, li, .sb-row, div') || el; row.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); row.classList.add('flash');
}

/* ---------- minhas atividades ---------- */
function myUnits() {
  const me = myPessoaSafe(); if (!me) return [];
  const out = [];
  allActs().forEach(x => {
    const a = x.a; if (x.c.canc || !a.metaId || !metaById(a.metaId)) return;
    const mine = a.respId === me, apoio = !mine && (a.apoioIds || []).includes(me), sc = x.c.subs || [];
    if (mine || apoio) out.push({ x, c: x.c, apoio });
    subsOf(a).forEach((s, i) => { if (s.respId === me && !mine && sc[i]) out.push({ x, s, si: i, c: sc[i] }); });
  });
  return out;
}
function minhasBadge() { const n = myUnits().filter(u => !u.apoio && !u.c.done && stKind(u.c.status) === 'atraso').length; return n ? `<span class="cnt hot" data-tip="${n} com atraso">${n}</span>` : ''; }
function minhasSub() { const p = pessoaById(myPessoaSafe()); return p ? `Tudo o que está com ${esc(firstName(p.nome))}, em todos os projetos · hoje, ${longDate(today())}` : 'Seu usuário ainda não está ligado a um responsável'; }
function vMinhas() {
  const me = myPessoaSafe();
  if (!me) return `<div class="card empty"><h3>Seu usuário não está ligado a um responsável</h3><p>Peça ao administrador para vincular seu usuário a um responsável em “Usuários e acessos”.</p></div>`;
  const T = today(), all = myUnits(), open = all.filter(u => !u.c.done);
  const novas = new Set(alerts().filter(o => o.t === 'nova' && !o.lida).map(o => o.x.a.id + ':' + (o.s ? o.s.id : '')));
  const used = new Set(), take = f => open.filter(u => !used.has(u) && f(u)).map(u => (used.add(u), u));
  const late = take(u => stKind(u.c.status) === 'atraso').sort((a, b) => a.c.fp - b.c.fp);
  const risk = take(u => u.c.status === 'risco').sort((a, b) => a.c.fp - b.c.fp);
  const soon = take(u => u.c.fp != null && u.c.fp <= T + 7).sort((a, b) => a.c.fp - b.c.fp);
  const run = take(u => u.c.ir != null).sort((a, b) => a.c.fp - b.c.fp);
  const next = take(() => true).sort((a, b) => a.c.ip - b.c.ip);
  const recent = all.filter(u => u.c.done && u.c.fr >= T - 14).sort((a, b) => b.c.fr - a.c.fr);
  const venc = all.filter(u => !u.apoio && (u.c.done || u.c.status === 'atrasada')), ok = venc.filter(u => u.c.status === 'concluida').length;
  const btn = (u) => {
    if (u.apoio || u.c.done) return '';
    const a = u.x.a;
    if (u.s) { if (!canLog(a, u.s)) return ''; return u.c.ir == null ? `<button class="btn sm" data-act="sub-start" data-id="${a.id}" data-sid="${u.s.id}">${ic('play', 'fill')}<span>Iniciar</span></button>` : `<button class="btn sm go" data-act="sub-finish" data-id="${a.id}" data-sid="${u.s.id}">${ic('check')}<span>Concluir</span></button>`; }
    if (u.c.subs) return nextSubQA(u.x);
    if (!canLog(a, null)) return '';
    return u.c.ir == null ? `<button class="btn sm" data-act="start" data-id="${a.id}">${ic('play', 'fill')}<span>Iniciar hoje</span></button>` : `<button class="btn sm go" data-act="finish" data-id="${a.id}">${ic('check')}<span>Concluir hoje</span></button>`;
  };
  let i = 0;
  const row = u => {
    const a = u.x.a, m = u.x.m, c = u.c, isNew = novas.has(a.id + ':' + (u.s ? u.s.id : ''));
    const due = c.done ? `concluída em ${fds(c.fr)}` : c.fp == null ? '' : c.fp < T ? `venceu ${fds(c.fp)}` : c.fp === T ? 'vence hoje' : c.fp === T + 1 ? 'vence amanhã' : `vence ${fds(c.fp)}`;
    return `<li class="my rise ${isNew ? 'new' : ''}" style="--i:${Math.min(i++, 14)}" data-act="my-open" data-id="${a.id}" data-sid="${u.s ? u.s.id : ''}" tabindex="0">
      <div class="my-b"><div class="my-t">${isNew ? '<span class="newtag">Nova</span>' : ''}${u.s ? etBadge(u.si + 1) : ''}<b>${esc(u.s ? u.s.nome : a.titulo)}</b></div>
      <div class="my-s">${chip(c.status, 'sm')}<span class="mchip"><i class="dot" style="background:${metaColor(m)}"></i><span>${esc(m.nome)}</span></span>${u.s ? `<span class="muted my-par">em ${esc(a.titulo)}</span>` : ''}${u.apoio ? '<span class="aptag">você no apoio</span>' : ''}</div></div>
      <span class="my-d ${!c.done && c.fp != null && c.fp < T ? 'hot' : ''}">${due}</span><div class="qa">${btn(u)}</div></li>`;
  };
  const grp = (t, arr, hint = '', cls = '') => arr.length ? `<section class="card my-g ${cls}"><div class="card-h"><h2>${t} <span class="muted" style="font-weight:500">${arr.length}</span></h2>${hint ? `<span class="sub">${hint}</span>` : ''}</div><ul class="my-list">${arr.map(row).join('')}</ul></section>` : '';
  const kp = (l, v, c = '') => `<div><span>${l}</span><b class="${c}">${v}</b></div>`;
  return `<div class="dwrap">
    <div class="card rise my-head"><div class="dstats">${kp('Em aberto', open.filter(u => !u.apoio).length)}${kp('Atrasadas', late.filter(u => !u.apoio).length, late.length ? 'neg' : '')}${kp('Em risco', risk.filter(u => !u.apoio).length)}${kp('Entregas no prazo', venc.length ? Math.round(ok / venc.length * 100) + '%' : '—')}</div>
      ${novas.size ? `<p class="dhint"><b>${novas.size} ${novas.size === 1 ? 'atividade nova' : 'atividades novas'}</b> para você. Toque para ver o que foi cadastrado.</p>` : ''}</div>
    ${!open.length && !recent.length ? `<div class="card empty"><h3>Nada com você agora</h3><p>Quando um gestor cadastrar uma atividade para você, ela aparece aqui e no sino de avisos.</p></div>` : ''}
    ${grp('Atrasadas', late, 'resolva ou alinhe com o gestor', 'g-late')}${grp('Em risco', risk, 'perto do fim sem avanço suficiente', 'g-risk')}${grp('Vencem nos próximos 7 dias', soon)}${grp('Em andamento', run)}${grp('Próximas', next, 'ainda não começaram')}${grp('Concluídas nos últimos 14 dias', recent, '', 'g-done')}
  </div>`;
}

/* ---------- produtividade (Reunião) ---------- */
function planEndAt(o, D) { const later = (o.replans || []).filter(r => r.em && P(String(r.em).slice(0, 10)) > D); return later.length ? P(later[0].fimDe) : P(o.fimPlan); }
function prodData(de, ate) {
  const T = today(), dueBy = Math.min(ate, T), by = new Map();
  const g0 = pid => { if (!by.has(pid)) by.set(pid, { pid, N: 0, R: 0, ok: 0, late: 0, rep: 0, rec: 0, adi: 0, vencer: 0, items: [] }); return by.get(pid); };
  acts().forEach(x => {
    if (x.c.canc) return;
    const a = x.a, subs = subsOf(a);
    const units = subs.length ? subs.map((s, i) => ({ o: s, resp: s.respId || a.respId, si: i })) : [{ o: a, resp: a.respId }];
    units.forEach(u => {
      const cr = created(u.o) ?? created(a);
      const fpS = cr != null && cr > de ? P(u.o.fimOrig || u.o.fimPlan) : planEndAt(u.o, de); // plano do início do período
      if (fpS == null) return;
      const fpNow = P(u.o.fimPlan); let fr = P(u.o.fimReal); if (fr != null && fr > ate) fr = null;
      const g = g0(u.resp || '_none'), it = { x, s: subs.length ? u.o : null, si: u.si, fpS, fr };
      if (fpS > de && fpS <= ate) {
        if (fpS > dueBy && fr == null) { g.vencer++; g.items.push({ ...it, k: 'vencer' }); return; }
        g.N++;
        if (fr != null) { g.R++; if (fr <= fpS) g.ok++; g.items.push({ ...it, k: fr <= fpS ? 'ok' : 'tarde' }); }
        else {
          g.late++;
          const moved = fpNow > ate || (u.o.replans || []).some(r => { const d = P(String(r.em).slice(0, 10)); return d > de && d <= ate; });
          if (moved) g.rep++; g.items.push({ ...it, k: moved ? 'replan' : 'atraso' });
        }
      } else if (fr != null && fr > de && fpS <= de) { g.rec++; g.items.push({ ...it, k: 'rec' }); }
      else if (fr != null && fr > de && fpS > ate) { g.adi++; g.items.push({ ...it, k: 'adi' }); }
    });
  });
  return [...by.values()].map(g => ({ ...g, pct: g.N ? g.R / g.N * 100 : null }));
}
function prodTotal(de, ate) { const r = prodData(de, ate), N = r.reduce((s, g) => s + g.N, 0), R = r.reduce((s, g) => s + g.R, 0); return N ? Math.round(R / N * 100) + '%' : '—'; }
S.prodOpen = new Set();
const PK = { ok: ['Entregue no prazo', 'concluida'], tarde: ['Entregue com atraso', 'concluida_atraso'], atraso: ['Ficou em atraso', 'atrasada'], replan: ['Ficou em atraso (replanejada)', 'atrasada'], rec: ['Recuperada (era de antes)', 'concluida_atraso'], adi: ['Adiantada (era para depois)', 'concluida'], vencer: ['Ainda vai vencer no período', 'nao_iniciada'] };
function prodHTML(de, ate) {
  const rows = prodData(de, ate), ranked = rows.filter(g => g.N).sort((a, b) => b.pct - a.pct || b.R - a.R || b.N - a.N);
  const rest = rows.filter(g => !g.N && (g.rec || g.adi || g.vencer));
  const nm = (pid, i) => S.prodHide ? `Pessoa ${String.fromCharCode(65 + (i % 26))}` : pid === '_none' ? 'Sem responsável' : (pessoaById(pid) || {}).nome || 'Pessoa removida';
  const av = (pid, i) => S.prodHide ? `<span class="av" style="--c:var(--st-none)">${String.fromCharCode(65 + (i % 26))}</span>` : avatar(pessoaById(pid));
  const col = p => p >= 80 ? 'var(--st-done)' : p >= 50 ? 'var(--st-risk)' : 'var(--st-late)';
  const pill = (n, l, c) => n ? `<span class="pd-p" style="--c:${c}">${n} ${l}</span>` : '';
  const items = g => S.prodOpen.has(g.pid) ? `<ul class="pd-items">${g.items.sort((a, b) => a.fpS - b.fpS).map(it => `<li data-act="my-open" data-id="${it.x.a.id}" data-sid="${it.s ? it.s.id : ''}"><span class="mono muted">${esc(it.x.a.codigo || '')}</span>${it.s ? etBadge(it.si + 1) : ''}<b>${esc(it.s ? it.s.nome : it.x.a.titulo)}</b><span class="muted">vencia ${fds(it.fpS)}${it.fr != null ? ' · feita ' + fds(it.fr) : ''}</span>${chip(PK[it.k][1], 'sm').replace(ST[PK[it.k][1]].l, PK[it.k][0])}</li>`).join('')}</ul>` : '';
  const head = `<div class="pd-top"><p class="muted">Conta o que vencia entre ${fds(de + 1)} e ${fds(ate)} pelo plano do início do período. Replanejar para fora do período não apaga a falha. Recuperadas e adiantadas aparecem à parte e não mudam o %.</p>
    <button class="chipb ${S.prodHide ? 'on' : ''}" data-act="prod-hide">${ic('olho')}${S.prodHide ? 'Mostrar nomes' : 'Ocultar nomes'}</button></div>`;
  if (!ranked.length && !rest.length) return head + '<p class="muted">Nenhuma entrega vencia neste período.</p>';
  return head + `<div class="pd-list">${ranked.map((g, i) => `<div class="pd-row ${i < 3 ? 'top' : ''}" data-act="prod-tog" data-p="${g.pid}" tabindex="0" aria-expanded="${S.prodOpen.has(g.pid)}">
      <span class="pd-rk">${i + 1}º</span><span class="who">${av(g.pid, i)}<span>${esc(nm(g.pid, i))}</span></span>
      <div class="pd-bar"><i class="grow" style="--i:${i};width:${g.pct.toFixed(1)}%;background:${col(g.pct)}"></i></div>
      <b class="pd-pct tnum">${Math.round(g.pct)}%</b><span class="pd-n muted">${g.R} de ${g.N}</span>
      <div class="pd-ps">${pill(g.ok, 'no prazo', 'var(--st-done)')}${pill(g.R - g.ok, 'com atraso', 'var(--st-donelate)')}${pill(g.late, g.late === 1 ? 'ficou em atraso' : 'ficaram em atraso', 'var(--st-late)')}${g.rep ? pill(g.rep, g.rep === 1 ? 'replanejada' : 'replanejadas', 'var(--st-risk)') : ''}${pill(g.rec, 'recuperada' + (g.rec > 1 ? 's' : ''), 'var(--st-run)')}${pill(g.adi, 'adiantada' + (g.adi > 1 ? 's' : ''), 'var(--accent)')}${pill(g.vencer, 'a vencer', 'var(--st-none)')}</div></div>${items(g)}`).join('')}</div>
    ${rest.length ? `<div class="pd-rest"><span class="muted">Sem entrega vencendo no período:</span> ${rest.map((g, i) => `<button class="chipb" data-act="prod-tog" data-p="${g.pid}">${esc(nm(g.pid, ranked.length + i))}${g.rec ? ` · ${g.rec} recuperada${g.rec > 1 ? 's' : ''}` : ''}${g.adi ? ` · ${g.adi} adiantada${g.adi > 1 ? 's' : ''}` : ''}${g.vencer ? ` · ${g.vencer} a vencer` : ''}</button>`).join(' ')}${rest.filter(g => S.prodOpen.has(g.pid)).map(items).join('')}</div>` : ''}`;
}
const WORSE_FROM = ['nao_iniciada', 'andamento', 'risco', 'inicio_atrasado'];
function isDrift(o) { return ['atrasada', 'inicio_atrasado', 'risco'].includes(o.para) && WORSE_FROM.includes(o.de) && ST[o.para].o < ST[o.de].o; }
function groupResp(arr, f, empty) {
  if (!arr.length) return `<p class="muted">${empty}</p>`;
  const g = new Map();
  arr.forEach(o => { const pid = (o.s && o.s.respId) || o.x.a.respId || ''; if (!g.has(pid)) g.set(pid, []); g.get(pid).push(o); });
  const nmOf = pid => (pessoaById(pid) || { nome: '~' }).nome;
  return [...g.entries()].sort((a, b) => nmOf(a[0]).localeCompare(nmOf(b[0]), 'pt-BR')).map(([pid, xs]) => `<div class="rp-grp"><div class="rp-gh">${whoHTML(pessoaById(pid))}<span class="muted">${xs.length}</span></div><ul class="rp-list">${xs.map(f).join('')}</ul></div>`).join('');
}
function refreshPresent() { if ($('#present') && !$('#present').hidden && S.presI != null) openPresent(S.presI); }

/* ---------- juntar / dividir pessoas ---------- */
function openMergePessoa(id) {
  const p = pessoaById(id); if (!p) return;
  const touched = S.atividades.filter(a => a.respId === id || (a.apoioIds || []).includes(id) || subsOf(a).some(s => s.respId === id));
  const others = [...S.pessoas].filter(x => x.id !== id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const opts = others.map(x => `<option value="${x.id}">${esc(x.nome)}</option>`).join('');
  openModal(`<form id="fmg" novalidate><div class="md-h"><h3>Juntar ou dividir “${esc(p.nome)}”</h3><p>Use para limpar cadastros duplicados ou duplas como “Jorge/Thiago”. Tudo o que está com ${esc(p.nome)} passa para quem você escolher, e “${esc(p.nome)}” é excluído.</p></div>
    <div class="md-b"><div class="cols2"><div class="f"><label for="mg-p">Passar para (responsável principal) <span class="req">*</span></label><select class="sel" id="mg-p"><option value="">Escolha…</option>${opts}</select></div>
      <div class="f"><label for="mg-a">Apoio (opcional)</label><select class="sel" id="mg-a"><option value="">Ninguém</option>${opts}</select><span class="hint">Para dividir uma dupla: um vira o responsável e o outro fica no apoio.</span></div></div>
      <div class="planhint">${ic('info')}<span><b>${touched.length} ${touched.length === 1 ? 'atividade' : 'atividades'}</b> com ${esc(p.nome)} (como responsável, apoio ou em etapas). Prazos e histórico não mudam${S.isAdmin ? '; usuários ligados a esta pessoa passam para a nova' : ''}.</span></div>
      <p class="err" id="mg-err" role="alert"></p></div>
    <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">${ic('juntar')}Juntar e excluir “${esc(p.nome)}”</button></div></form>`);
  $('#fmg').addEventListener('submit', async e => {
    e.preventDefault();
    const to = $('#mg-p').value, ap = $('#mg-a').value, er = $('#mg-err');
    if (!to) { er.textContent = 'Escolha quem recebe as atividades.'; return; }
    if (ap && ap === to) { er.textContent = 'O apoio precisa ser outra pessoa.'; return; }
    const btn = e.submitter || $('#fmg button[type=submit]'); btn.disabled = true;
    let bad = 0;
    for (let i = 0; i < touched.length; i += 5) {
      await Promise.all(touched.slice(i, i + 5).map(async a => {
        const patch = { atualizadoEm: nowISO() };
        let resp = a.respId, apoio = (a.apoioIds || []).slice();
        if (resp === id) { resp = to; patch.respId = to; if (ap) apoio.push(ap); }
        apoio = apoio.map(x => x === id ? to : x).filter((x, k, arr) => x !== resp && arr.indexOf(x) === k);
        if (JSON.stringify(apoio) !== JSON.stringify(a.apoioIds || [])) patch.apoioIds = apoio;
        if (subsOf(a).some(s => s.respId === id)) {
          patch.etapas = subsOf(a).map(s => s.respId === id ? { ...s, respId: to === resp ? '' : to } : s);
          if (ap && a.respId !== id) patch.apoioIds = [...apoio, ap].filter((x, k, arr) => x !== resp && arr.indexOf(x) === k);
        }
        if (!(await write(() => db.doc('atividades/' + a.id).update(patch), true))) bad++;
      }));
    }
    if (bad) { btn.disabled = false; er.textContent = `${bad} atividades não puderam ser atualizadas. Nada foi excluído; tente de novo.`; return; }
    if (S.isAdmin) { try { await sb.from('profiles').update({ pessoa_id: to }).eq('pessoa_id', id); if (S.adm) S.adm.loaded = false; } catch (x) {} }
    if (await write(() => db.doc('pessoas/' + id).delete())) { logEvt('edicao', null, `Pessoa “${p.nome}” juntada a “${(pessoaById(to) || {}).nome}”${ap ? ' com apoio de “' + (pessoaById(ap) || {}).nome + '”' : ''}`); closeModal(); toast(`${touched.length} atividades passaram para ${(pessoaById(to) || {}).nome}. “${p.nome}” foi excluído.`, 'ok'); }
  });
}

/* ---------- topo, celular, ajuda ---------- */
function closePops() {
  const m = $('#moreMenu'); if (m && !m.hidden) { m.hidden = true; $('#btnMore').setAttribute('aria-expanded', 'false'); }
  const b = $('#bellPop'); if (b && !b.hidden) { b.hidden = true; b.classList.remove('on'); $('#btnBell').setAttribute('aria-expanded', 'false'); }
  const sh = $('#sheet'); if (sh && !sh.hidden) { sh.classList.remove('on'); setTimeout(() => { if (!sh.classList.contains('on')) sh.hidden = true; }, 220); }
}
function toggleMore() {
  const m = $('#moreMenu'), open = m.hidden; closePops();
  if (open) { m.hidden = false; $('#btnMore').setAttribute('aria-expanded', 'true'); const f = m.querySelector('button:not([hidden])'); if (f) f.focus(); }
}
const MSHORT = { minhas: 'Minhas', projetos: 'Projetos', reuniao: 'Reunião', usuarios: 'Usuários', painel: 'Painel', atividades: 'Atividades', cronograma: 'Cronograma', financeiro: 'Financeiro' };
function renderMobileNav() {
  const el = $('#mnav'); if (!el) return;
  if (S.state !== 'ready') { el.innerHTML = ''; return; }
  const it = k => `<a href="#${VIEWS[k].home && !VIEWS[k].both ? k : projHash(k)}" class="${S.view === k ? 'on' : ''}" ${S.view === k ? 'aria-current="page"' : ''}>${ic(VIEWS[k].i)}<span>${MSHORT[k]}</span>${k === 'minhas' ? `<i class="mdot" ${alerts().some(o => !o.lida && o.t === 'nova') ? '' : 'hidden'}></i>` : ''}</a>`;
  const keys = S.proj ? ['painel', 'atividades', 'cronograma', 'reuniao'] : [myPessoaSafe() ? 'minhas' : null, 'projetos', 'reuniao', S.isAdmin ? 'usuarios' : null].filter(Boolean);
  el.innerHTML = keys.map(it).join('') + `<button data-act="m-more" aria-haspopup="dialog">${ic('ajustes')}<span>Mais</span></button>`;
}
function openSheet() {
  const sh = $('#sheet'); closePops();
  sh.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet-p" role="dialog" aria-label="Mais opções"><div class="sheet-grab"></div>
    <div class="nav sheet-nav">${$('#nav').innerHTML}</div>
    <div class="sheet-me">${$('#meBox') ? $('#meBox').innerHTML : ''}<button class="lnk" data-act="help">Ajuda e atalhos</button></div></div>`;
  sh.hidden = false; requestAnimationFrame(() => sh.classList.add('on'));
}
function openHelp() {
  closePops();
  openModal(`<div class="md-h"><h3>Ajuda e atalhos</h3><p>Como o sistema calcula as situações e os indicadores.</p></div>
    <div class="md-b help">
      <div><b>Atalhos</b><p><span class="kbd2">N</span> nova atividade (dentro de um projeto) · <span class="kbd2">/</span> buscar atividade · <span class="kbd2">Esc</span> fecha janelas</p></div>
      <div><b>Situações</b><ul class="help-st">${ST_KEYS.filter(k => k !== 'cancelada').map(k => `<li>${chip(k, 'sm')}<span>${({ atrasada: 'passou do fim planejado sem concluir', inicio_atrasado: 'passou do início planejado sem começar', risco: `faltam até ${S.cfg.diasRisco} dias e o avanço está atrás do esperado (ou não foi informado), ou o avanço está 25 pontos abaixo`, andamento: 'começou e está em dia', nao_iniciada: 'ainda não chegou a data de início', pausada: 'parada por decisão do gestor', concluida_atraso: 'terminou depois do fim planejado atual', concluida: 'terminou até o fim planejado atual' })[k]}</span></li>`).join('')}</ul></div>
      <div><b>Entregas no prazo</b><p>Das entregas que já venceram (concluídas ou passaram do fim), quantas foram feitas até o fim planejado. Atrasadas em aberto contam como fora do prazo.</p></div>
      <div><b>Produtividade (Reunião)</b><p>Do que vencia no período pelo plano do início do período, quanto foi entregue. Replanejar para fora não apaga a falha.</p></div>
      <div><b>Dias</b><p>“d” são dias corridos e “d.ú.” dias úteis, conforme a configuração de cada projeto.</p></div>
      <div><b>Avisos (sino)</b><p>Novas atividades atribuídas a você, além das suas atividades atrasadas ou em risco. Gestores também veem atraso e risco do projeto inteiro.</p></div>
    </div><div class="md-f"><button type="button" class="btn primary" data-act="close-modal">Entendi</button></div>`);
}
function v2After() {
  const ids = ['btnImport', 'btnExport', 'btnEditProj', 'btnConfig'];
  const bm = $('#btnMore'); if (bm) bm.hidden = ids.every(id => $('#' + id).hidden);
  renderBell(); renderMobileNav();
  document.body.classList.toggle('in-proj', !!S.proj);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) { if (!e.target.closest('#bellPop, #moreMenu, .sheet-p')) closePops(); return; }
  const act = t.dataset.act;
  if (!['bell', 'more', 'm-more'].includes(act) && !t.closest('#bellPop') && !t.closest('#moreMenu')) closePops();
  switch (act) {
    case 'bell': e.stopPropagation(); openBell(); break;
    case 'more': e.stopPropagation(); toggleMore(); break;
    case 'm-more': openSheet(); break;
    case 'sheet-close': case 'pop-close': closePops(); break;
    case 'pop-close-go': closePops(); location.hash = 'minhas'; break;
    case 'help': closePops(); setTimeout(openHelp, 0); break;
    case 'al-tab': S.bellTab = t.dataset.t; renderBellPop(); break;
    case 'al-open': openAlert(t.dataset.k); break;
    case 'al-read': e.stopPropagation(); markRead([t.dataset.k]); break;
    case 'al-all': markRead(alerts().map(o => o.k)); break;
    case 'my-open': {
      const sid = t.dataset.sid || null, o = alerts().find(z => z.t === 'nova' && z.x.a.id === t.dataset.id && (z.s ? z.s.id : null) === sid && !z.lida);
      if (o) markRead([o.k]);
      if (S.presI != null) closePresent();
      openAct(t.dataset.id); if (sid) setTimeout(() => focusSub(sid), 380); break; }
    case 'prod-hide': S.prodHide = !S.prodHide; render(); refreshPresent(); break;
    case 'prod-tog': { const p = t.dataset.p; if (S.prodOpen.has(p)) S.prodOpen.delete(p); else S.prodOpen.add(p); render(); refreshPresent(); break; }
    case 'merge-pessoa': e.stopPropagation(); openMergePessoa(t.dataset.id); break;
  }
  if (t.closest('#moreMenu') && act !== 'more') closePops();
  if (t.closest('.sheet-p') && t.tagName === 'A') closePops();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ($('#bellPop') && !$('#bellPop').hidden || $('#moreMenu') && !$('#moreMenu').hidden || $('#sheet') && !$('#sheet').hidden)) { closePops(); e.stopImmediatePropagation(); }
}, true);
window.addEventListener('hashchange', closePops);
addEventListener('resize', () => { const b = $('#bellPop'); if (b && !b.hidden) closePops(); });
// celular: cronograma abre na semana quando a pessoa ainda não escolheu o zoom
try { if (innerWidth < 760 && !JSON.parse(localStorage.getItem(PREF_KEY) || '{}').zoom) S.zoom = 'semana'; } catch (e) {}
