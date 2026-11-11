/* ===================== FINANCEIRO ===================== */
/* Valor ajustado = contrato + aditivos − faturamento direto (compras feitas direto pelo cliente, que abatem da obra).
   A pagar = ajustado − pagamentos. Lançamentos ficam em tabelas próprias, com histórico gravado pelo banco.
   Quem não tem acesso financeiro vê só os totais no painel (função fin_resumo). */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => BRL.format(+v || 0);
const brlIn = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function parseBRL(s) {
  s = String(s ?? '').replace(/[R$\s]/g, ''); if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isNaN(n) ? NaN : Math.round(n * 100) / 100;
}
const canFin = pid => S.isAdmin || !!(S.finAcc && S.finAcc[pid]);
const finOn = pid => !!(pid && pid !== '_none' && (metaById(pid) || {}).financeiro);
const finVisible = pid => finOn(pid) && canFin(pid);
const finCalc = (contrato, aditivos, fd, pago) => { const aj = (+contrato || 0) + (+aditivos || 0) - (+fd || 0); return { contrato: +contrato || 0, aditivos: +aditivos || 0, fd: +fd || 0, pago: +pago || 0, aj, aPagar: aj - (+pago || 0), pct: aj > 0 ? (+pago || 0) / aj * 100 : 0 }; };
const FT = { pagamento: { l: 'Pagamentos', one: 'pagamento', novo: 'Novo pagamento', ic: 'check' }, fd: { l: 'Faturamento direto', one: 'compra de faturamento direto', novo: 'Nova compra (FD)', ic: 'down' }, aditivo: { l: 'Aditivos', one: 'aditivo', novo: 'Novo aditivo', ic: 'plus' } };
S.finD = {}; S.finR = {}; S.finTab = 'ativ'; S.finQ = '';

async function loadFin(pid, force) {
  const D = S.finD[pid] || (S.finD[pid] = { loaded: false, loading: false });
  if (D.loading || (D.loaded && !force)) return;
  D.loading = true;
  try {
    const [c, i, l, v] = await Promise.all([
      sb.from('fin_contratos').select('*').eq('project_id', pid).maybeSingle(),
      sb.from('fin_itens').select('*').eq('project_id', pid).order('data', { ascending: false }),
      sb.from('fin_log').select('*').eq('project_id', pid).order('em', { ascending: false }).limit(80),
      sb.from('fin_valores').select('*').eq('project_id', pid)]);
    if (c.error || i.error || l.error || v.error) throw (c.error || i.error || l.error || v.error);
    Object.assign(D, { contrato: c.data || null, itens: (i.data || []).map(x => ({ ...x, valor: +x.valor })), log: l.data || [], valores: (v.data || []).map(x => ({ ...x, valor: +x.valor })), loaded: true, err: false, v: (D.v || 0) + 1 });
  } catch (e) { D.err = true; }
  D.loading = false; S.finR[pid] = null; schedule(); refreshFinBox();
}
async function loadFinRes(pid) {
  const R = S.finR[pid];
  if (R && (R.loading || Date.now() - R.at < 60000)) return;
  S.finR[pid] = { loading: true, at: Date.now() };
  try { const { data, error } = await sb.rpc('fin_resumo', { pid }); if (error) throw error; S.finR[pid] = { ...data, at: Date.now() }; }
  catch (e) { S.finR[pid] = { err: true, at: Date.now() }; }
  schedule();
}
function finTotals(D) {
  const sum = t => (D.itens || []).filter(x => x.tipo === t).reduce((s, x) => s + (+x.valor || 0), 0);
  return finCalc(D.contrato ? D.contrato.valor : 0, sum('aditivo'), sum('fd'), sum('pagamento'));
}
function finAlerts(k) {
  const out = [];
  if (k.contrato && k.fd > k.contrato + k.aditivos) out.push('O faturamento direto passou do valor do contrato com aditivos. Confira os lançamentos.');
  if (k.aj > 0 && k.pago > k.aj + 0.005) out.push(`Os pagamentos passaram do valor ajustado em ${brl(k.pago - k.aj)}.`);
  if (!k.contrato && (k.pago || k.fd)) out.push('Cadastre o valor do contrato para calcular o saldo a pagar.');
  return out;
}

/* ---------- curva físico × financeiro (mesmo desenho da Curva S do painel) ---------- */
function drawFinChart(host, pid, pagamentos, aj, ex = null) {
  const L = live(allActs().filter(x => x.a.metaId === pid)), T = today();
  const pays = pagamentos.map(p => ({ d: P(String(p.d).slice(0, 10)), v: +p.v || 0 })).filter(p => p.d != null).sort((a, b) => a.d - b.d);
  if (!L.length && !pays.length) { host.innerHTML = '<p class="muted">O gráfico aparece quando houver atividades ou pagamentos.</p>'; return; }
  let lo = Infinity, hi = -Infinity;
  L.forEach(x => { lo = Math.min(lo, x.c.ip, x.c.ir ?? Infinity); hi = Math.max(hi, x.c.fp, x.c.fr ?? -Infinity); });
  pays.forEach(p => { lo = Math.min(lo, p.d); hi = Math.max(hi, p.d); });
  if (!isFinite(lo)) lo = T - 30; if (!isFinite(hi)) hi = T;
  lo = Math.min(lo, T) - 1; hi = Math.max(hi, T) + 1;
  const step = Math.max(1, Math.ceil((hi - lo) / 220)), days = [];
  for (let d = lo; d <= hi; d += step) days.push(d);
  if (!days.includes(hi)) days.push(hi); if (!days.includes(T)) days.push(T); days.sort((a, b) => a - b);
  const cum = d => pays.reduce((s, p) => s + (p.d <= d ? p.v : 0), 0);
  const Wt = L.reduce((t, x) => t + (+x.a.peso || 1), 0) || 1;
  const valAt = (x, d) => {
    const c = x.c, v = c.valor;
    if (d >= T) return v;
    if (c.fr != null) return c.fr <= d ? 1 : (c.ir != null && c.ir <= d && c.fr > c.ir ? (d - c.ir) / (c.fr - c.ir) : 0);
    if (c.di && c.di.on) return Math.min(v, c.di.realAt(d) / 100);
    return c.ir != null && c.ir <= d && T > c.ir ? v * (d - c.ir) / (T - c.ir) : 0;
  };
  const fisAt = d => L.reduce((t, x) => t + (+x.a.peso || 1) * valAt(x, d), 0) / Wt;
  const exAt = d => ex ? ex.rows.reduce((t, r) => t + r.valor * valAt(r.x, d), 0) / ex.base : 0;
  const pts = days.filter(d => d <= T).map(d => ({ d, real: fisAt(d), ex: exAt(d) }));
  const pctPago = d => aj > 0 ? cum(d) / aj : 0;
  const top = Math.max(1, Math.ceil(Math.max(...pays.map(p => pctPago(p.d)), 0) * 4) / 4);
  const Wd = host.clientWidth || 600, H = 250, m = { l: 40, r: Wd < 520 ? 14 : 78, t: 12, b: 26 }, iw = Wd - m.l - m.r, ih = H - m.t - m.b;
  const X = d => m.l + (d - lo) / (hi - lo) * iw, Y = v => m.t + ih - Math.min(v, top) / top * ih;
  const line = (k, upto = hi) => pts.filter(p => p.d <= upto).map((p, i) => (i ? 'L' : 'M') + X(p.d).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join('');
  // pagamentos acumulados: degraus (o valor só muda no dia do pagamento)
  const pEnd = Math.max(T, pays.length ? pays[pays.length - 1].d : T);
  let acc = 0, sp = `M${X(lo).toFixed(1)},${Y(0).toFixed(1)}`;
  pays.forEach(p => { sp += `H${X(p.d).toFixed(1)}`; acc += p.v; sp += `V${Y(aj > 0 ? acc / aj : 0).toFixed(1)}`; });
  sp += `H${X(pEnd).toFixed(1)}`;
  const area = `${sp}V${Y(0).toFixed(1)}H${X(lo).toFixed(1)}Z`;
  const yT = top > 1 ? [0, .25, .5, .75, 1, top] : [0, .25, .5, .75, 1];
  let xT = []; const span = hi - lo;
  if (span <= 50) { for (let d = lo; d <= hi; d++) if (wd(d) === 1) xT.push({ d, l: fds(d) }); }
  else { for (let d = lo; d <= hi; d++) { const dt = Dt(d); if (dt.getUTCDate() === 1) xT.push({ d, l: MES[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 ? ' ' + dt.getUTCFullYear() : '') }); } }
  if (span > 300) xT = xT.filter((_, i) => i % 2 === 0);
  const rNow = L.length ? metaStats(pid, allActs()).prog / 100 : 0, fNow = pctPago(T); // igual ao "Progresso geral" do painel
  const eNow = ex ? ex.now : 0;
  if (pts.length) { pts[pts.length - 1].real = rNow; pts[pts.length - 1].ex = eNow; }
  const gapEl = document.getElementById('fgap');
  if (gapEl) {
    const pp = v => Math.round(v * 100), gd = pp(fNow) - pp(rNow), warn = gd > 10;
    gapEl.innerHTML = `<span>Hoje: avanço real <b>${pp(rNow)}%</b> · pago <b>${pp(fNow)}%</b> do valor ajustado (${brl(cum(T))}).</span><span>Pago − real <b class="${warn ? 'neg' : gd < -10 ? '' : 'pos'}">${gd > 0 ? '+' : gd < 0 ? '−' : ''}${Math.abs(gd)} p.p.</b>${warn ? ' · pagamentos à frente da obra' : gd < -10 ? ' · pagamentos atrás da obra' : ' · em linha'}</span>`;
  }
  // rótulos do dia de hoje sem sobrepor
  const labs = [L.length ? { y: Y(rNow), t: Math.round(rNow * 100) + '% real', c: 'var(--ink)' } : null, ex ? { y: Y(eNow), t: Math.round(eNow * 100) + '% executado', c: 'var(--accent)' } : null, { y: Y(fNow), t: Math.round(fNow * 100) + '% pago', c: 'var(--fin)' }].filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 15) labs[i].y = labs[i - 1].y + 15;
  const right = X(T) > Wd - (Wd < 520 ? 90 : 150), lx = right ? X(T) - 10 : X(T) + 10, anc = right ? 'end' : 'start';
  const lbl = (y, txt, c) => `<text x="${lx}" y="${y + 4}" text-anchor="${anc}" style="font-size:12px;font-weight:700;fill:${c};paint-order:stroke;stroke:var(--surface);stroke-width:4px">${txt}</text>`;
  host.innerHTML = `<svg width="${Wd}" height="${H}" role="img" aria-label="Físico e financeiro: físico ${Math.round(rNow * 100)}%, pago ${Math.round(fNow * 100)}% até hoje">
    <defs><linearGradient id="fgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--fin)" stop-opacity=".22"/><stop offset="1" stop-color="var(--fin)" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${yT.map(v => `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
    <g class="axis">${yT.map(v => `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`).join('')}
    ${xT.map(t => `<text x="${X(t.d)}" y="${H - 6}" text-anchor="middle">${t.l}</text>`).join('')}</g>
    <line x1="${X(T)}" x2="${X(T)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--accent)" stroke-width="1" opacity=".55"/>
    <text x="${X(T)}" y="${m.t + 10}" text-anchor="middle" style="font-size:10.5px;font-weight:700;fill:var(--accent);paint-order:stroke;stroke:var(--surface);stroke-width:4px">Hoje</text>
    <path d="${area}" fill="url(#fgrad)" class="fadein"/>
    <path class="draw" pathLength="1" stroke-dasharray="1" d="${sp}" fill="none" stroke="var(--fin)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${ex ? `<path class="draw" pathLength="1" stroke-dasharray="1" d="${line('ex', T)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${L.length ? `<path class="draw" pathLength="1" stroke-dasharray="1" d="${line('real', T)}" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${pays.filter(p => p.d <= hi).map(p => `<circle cx="${X(p.d)}" cy="${Y(pctPago(p.d))}" r="2.6" fill="var(--fin)" class="fadein"/>`).join('')}
    ${ex ? `<circle cx="${X(T)}" cy="${Y(eNow)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>` : ''}
    ${L.length ? `<circle cx="${X(T)}" cy="${Y(rNow)}" r="4.5" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>` : ''}
    <circle cx="${X(T)}" cy="${Y(fNow)}" r="4.5" fill="var(--fin)" stroke="var(--surface)" stroke-width="2"/>
    ${labs.map(l => lbl(l.y, l.t, l.c)).join('')}
    <g id="fx" style="display:none"><line y1="${m.t}" y2="${m.t + ih}" stroke="var(--ink-2)" stroke-width="1"/><circle r="4" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/><circle r="4" fill="var(--fin)" stroke="var(--surface)" stroke-width="2"/><circle r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>
    <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" id="fhit"/></svg>`;
  const svg = host.querySelector('svg'), g = svg.querySelector('#fx'), hit = svg.querySelector('#fhit');
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), d = Math.max(lo, Math.min(hi, Math.round(lo + (e.clientX - r.left - m.l) / iw * (hi - lo))));
    const re = d <= T && L.length ? (d === T ? rNow : fisAt(d)) : null, fi = d <= pEnd ? pctPago(d) : null, xe = ex && d <= T ? (d === T ? eNow : exAt(d)) : null, x = X(d);
    g.style.display = ''; g.children[0].setAttribute('x1', x); g.children[0].setAttribute('x2', x);
    [[1, re], [2, fi], [3, xe]].forEach(([i, v]) => { const c = g.children[i]; if (v == null) c.style.display = 'none'; else { c.style.display = ''; c.setAttribute('cx', x); c.setAttribute('cy', Y(v)); } });
    showTip(e.clientX, e.clientY, `<div class="th">${fd(d)}${d === T ? ' · hoje' : ''}</div>
      ${re != null ? `<div class="tr"><i style="--c:#fff"></i><b>${Math.round(re * 100)}%</b><span>Avanço real</span></div>` : ''}
      ${xe != null ? `<div class="tr"><i style="--c:#9fb2ff"></i><b>${Math.round(xe * 100)}%</b><span>Executado · ${brl(xe * ex.base)}</span></div>` : ''}
      ${fi != null ? `<div class="tr"><i style="--c:#2cc4ad"></i><b>${Math.round(fi * 100)}%</b><span>Pago · ${brl(cum(d))}</span></div>` : ''}`);
  });
  hit.addEventListener('pointerleave', () => { g.style.display = 'none'; hideTip(); });
}
function finCompareHTML(k, fis) {
  const gap = k.pct - fis, warn = gap > 10;
  const msg = !k.aj ? 'Cadastre o contrato para comparar.' : Math.abs(gap) < 5 ? 'Pagamentos acompanham o avanço físico.' : gap > 0 ? `Pagamentos estão ${Math.round(gap)} p.p. à frente do avanço físico.` : `Pagamentos estão ${Math.round(-gap)} p.p. atrás do avanço físico.`;
  return `<div class="fcmp"><div class="fcmp-r"><span>Físico</span><div class="bar"><i class="grow" style="width:${Math.min(100, fis).toFixed(1)}%;background:var(--ink)"></i></div><b class="tnum">${Math.round(fis)}%</b></div>
    <div class="fcmp-r"><span>Financeiro</span><div class="bar"><i class="grow" style="width:${Math.min(100, k.pct).toFixed(1)}%;background:var(--fin)"></i></div><b class="tnum">${Math.round(k.pct)}%</b></div>
    <p class="${warn ? 'fwarn' : 'muted'}">${warn ? ic('s_alert') : ''}${msg}</p></div>`;
}

/* ---------- painel do projeto: só totais, para todos do projeto ---------- */
function finPainelCard() {
  const pid = S.proj; if (!finOn(pid)) return '';
  const R = S.finR[pid];
  if (!R || R.loading) return `<div class="card fin-pc rise" style="--i:2"><div class="card-h"><h2>${ic('fin')}Financeiro</h2></div><div class="skel-line"></div><div class="skel-line" style="width:60%"></div></div>`;
  if (R.err) return '';
  const k = finCalc(R.contrato, R.aditivos, R.fd, R.pago), fis = metaStats(pid, allActs()).prog;
  return `<div class="card fin-pc rise" style="--i:2"><div class="card-h"><h2>${ic('fin')}Financeiro</h2>${canFin(pid) ? `<a class="sub" href="#${projHash('financeiro')}">abrir financeiro ${ic('seta')}</a>` : '<span class="sub">somente totais</span>'}</div>
    <div class="fin-mini"><div><span>Valor ajustado</span><b>${brl(k.aj)}</b></div><div><span>Pago até hoje</span><b>${brl(k.pago)}</b></div><div><span>A pagar</span><b class="${k.aPagar < 0 ? 'neg' : ''}">${brl(k.aPagar)}</b></div><div><span>Faturamento direto</span><b>${brl(k.fd)}</b></div></div>
    ${finCompareHTML(k, fis)}</div>`;
}
function finAfterPainel() { if (finOn(S.proj)) loadFinRes(S.proj); }

/* ---------- tela Financeiro ---------- */
function vFinanceiro() {
  const pid = S.proj;
  if (!finOn(pid)) return `<div class="card empty"><h3>Acompanhamento financeiro desligado</h3><p>Ligue em “Editar projeto” para acompanhar contrato, pagamentos e faturamento direto.</p>${S.isAdmin ? `<div class="row"><button class="btn" data-act="edit-meta" data-id="${pid}">${ic('editar')}Editar projeto</button></div>` : ''}</div>`;
  if (!canFin(pid)) return `<div class="card empty"><h3>Sem acesso ao financeiro</h3><p>Você vê os totais no painel. Para lançar, peça ao administrador o acesso financeiro deste projeto.</p></div>`;
  const D = S.finD[pid];
  if (!D || (!D.loaded && !D.err)) return loadingHTML();
  if (D.err && !D.loaded) return `<div class="card empty"><h3>Não foi possível carregar o financeiro</h3><div class="row"><button class="btn" data-act="fin-reload">Tentar de novo</button></div></div>`;
  const k = finTotals(D), F = finPlan(pid), al = finAlerts(k);
  if (F && Math.abs(F.falta) >= 0.01 && F.rows.length && k.contrato) al.push(F.falta > 0 ? `Falta distribuir ${brl(F.falta)} do contrato entre as atividades (aba “Por atividade”).` : `Os valores das atividades passam ${brl(-F.falta)} do contrato com aditivos.`);
  if (F && F.adiant.length) al.push(`${F.adiant.length} ${F.adiant.length === 1 ? 'atividade tem' : 'atividades têm'} pagamento acima do executado (pago adiantado).`);
  const kpi = (i, l, v, foot, c = '', act = '') => `<div class="kpi rise ${act ? 'click' : ''}" style="--i:${i}" ${act} ${act ? 'tabindex="0"' : ''}><div class="lbl">${l}</div><div class="val fval ${c}">${v}</div><div class="foot">${foot}</div></div>`;
  const kpis = `<div class="card kpis fin-k">
    ${kpi(0, 'Valor do contrato', brl(k.contrato), D.contrato && D.contrato.obs ? esc(D.contrato.obs) : 'clique para editar', '', 'data-act="fin-contrato"')}
    ${kpi(1, 'Aditivos', (k.aditivos > 0 ? '+' : '') + brl(k.aditivos), (n => `${n} ${n === 1 ? 'registrado' : 'registrados'}`)((D.itens || []).filter(x => x.tipo === 'aditivo').length))}
    ${kpi(2, 'Faturamento direto', '−' + brl(k.fd), 'abatido do valor da obra')}
    ${kpi(3, 'Valor ajustado', brl(k.aj), 'contrato + aditivos − faturamento direto', 'strong')}
    ${kpi(4, 'Executado', brl(F ? F.exec : 0), `${Math.round(F ? F.execPct : 0)}% do valor da obra (valor × avanço físico)`, '', 'data-act="fin-tab" data-t="ativ"')}
    ${kpi(5, 'Pago até hoje', brl(k.pago), `${Math.round(k.pct)}% do valor ajustado`)}
    ${kpi(6, 'A medir', brl(F ? F.aMedir : 0), F && (F.pagoGeral + F.fdGeral) > 0.5 ? 'executado − tudo o que já foi pago' : 'executado e ainda não pago', F && F.aMedir > 0.5 ? 'strong' : '', 'data-act="fin-med"')}
    ${kpi(7, 'A pagar', brl(k.aPagar), k.aPagar < 0 ? 'pago acima do ajustado' : 'saldo restante', k.aPagar < 0 ? 'neg' : 'strong')}</div>`;
  const pays = (D.itens || []).filter(x => x.tipo === 'pagamento').map(x => ({ d: x.data, v: x.valor }));
  S.finChart = { pid, pays, aj: k.aj, ex: F && F.base > 0 ? { base: F.base, rows: F.rows.map(r => ({ x: r.x, valor: r.valor })), now: F.execPct / 100 } : null };
  const cmp = `<div class="card fin-cmp rise" style="--i:3"><div class="card-h"><h2>Avanço real × avanço pago</h2><div class="lkeys"><span><i style="--c:var(--ink)"></i>Avanço real</span><span><i style="--c:var(--accent)"></i>Executado (% do valor da obra)</span><span><i style="--c:var(--fin)"></i>Avanço pago (% do valor ajustado)</span></div></div>
    <div class="sgap" id="fgap"></div><div class="chart" id="fchart" style="height:250px"></div></div>`;
  const tab = S.finTab, all = (D.itens || []).filter(x => x.tipo === tab), q = norm(S.finQ);
  const list = all.filter(x => !q || norm([x.descricao, x.fornecedor, x.nf].join(' ')).includes(q)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.created_at).localeCompare(String(a.created_at)));
  const tot = list.reduce((s, x) => s + x.valor, 0);
  const tabs = `<div class="fin-tabs" role="tablist"><button role="tab" aria-selected="${tab === 'ativ'}" class="${tab === 'ativ' ? 'on' : ''}" data-act="fin-tab" data-t="ativ">Por atividade<b>${F ? F.rows.length : 0}</b></button>${['pagamento', 'fd', 'aditivo'].map(t => `<button role="tab" aria-selected="${tab === t}" class="${tab === t ? 'on' : ''}" data-act="fin-tab" data-t="${t}">${FT[t].l}<b>${(D.itens || []).filter(x => x.tipo === t).length}</b></button>`).join('')}<button role="tab" aria-selected="${tab === 'log'}" class="${tab === 'log' ? 'on' : ''}" data-act="fin-tab" data-t="log">Histórico</button></div>`;
  let body;
  if (tab === 'ativ') body = finAtivHTML(pid);
  else if (tab === 'log') {
    const A = { insert: 'lançou', update: 'alterou', delete: 'excluiu' };
    body = (D.log || []).length ? `<ul class="rp-list fin-log">${D.log.map(l => { const it = l.acao === 'update' ? (l.item.depois || {}) : l.item, an = l.acao === 'update' ? (l.item.antes || {}) : null;
      const what = l.tipo === 'valor' ? (() => { const a = findAct(it.atividade_id), k2 = a && it.etapa_id ? subsOf(a).findIndex(z => z.id === it.etapa_id) : -1; const nm = a ? `${esc(a.codigo || '')} ${k2 >= 0 ? 'E' + (k2 + 1) + ' · ' + esc(subsOf(a)[k2].nome) : esc(a.titulo)}` : 'atividade excluída'; return l.acao === 'delete' ? `o valor de ${nm} (voltou ao automático, era ${brl(it.valor)})` : `o valor de ${nm}: ${an && an.valor != null ? brl(an.valor) + ' → ' : ''}${brl(it.valor)}`; })() : l.tipo === 'contrato' ? `valor do contrato ${an && an.valor != null ? brl(an.valor) + ' → ' : ''}${brl(it.valor)}` : `${FT[l.tipo] ? FT[l.tipo].one : l.tipo}: ${esc(it.descricao || '')} · ${an && an.valor !== it.valor ? brl(an.valor) + ' → ' : ''}${brl(it.valor)}`;
      return `<li><span class="mono muted">${new Date(l.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span><span><b>${esc(personName(l.por) || 'alguém')}</b> ${A[l.acao] || l.acao} ${what}</span></li>`; }).join('')}</ul>` : '<p class="muted">Nenhuma alteração registrada ainda.</p>';
  } else {
    const isFd = tab === 'fd';
    body = list.length ? `<div class="tbl-wrap" style="max-height:none;box-shadow:none"><table class="tbl ftbl cardify"><thead><tr><th>Data</th><th>Descrição</th>${tab !== 'aditivo' ? '<th>Referente a</th>' : ''}<th>${isFd ? 'Fornecedor' : tab === 'pagamento' ? 'Referência' : 'Motivo / documento'}</th><th>NF / doc.</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr class="row" data-act="fin-edit" data-id="${x.id}" data-p="${pid}" tabindex="0"><td class="mono" data-l="Data">${fd(P(x.data))}</td><td class="ttl" data-l="Descrição"><div>${esc(x.descricao)}</div>${x.medicao ? `<span class="aptag" style="margin:2px 0 0">medição ${esc(x.medicao)}</span>` : ''}</td>${tab !== 'aditivo' ? `<td data-l="Referente a" class="fref">${refLabel(x)}</td>` : ''}<td data-l="${isFd ? 'Fornecedor' : 'Referência'}">${esc(x.fornecedor) || '<span class="muted">—</span>'}</td><td class="mono" data-l="NF">${esc(x.nf) || '<span class="muted">—</span>'}</td><td class="tnum fv ${x.valor < 0 ? 'neg' : ''}" data-l="Valor">${tab === 'fd' ? '−' : x.valor > 0 && tab === 'aditivo' ? '+' : ''}${brl(x.valor)}</td><td><button class="btn icon ghost sm" data-act="fin-edit" data-id="${x.id}" data-p="${pid}" aria-label="Editar">${ic('editar')}</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="${tab !== 'aditivo' ? 5 : 4}"><b>Total ${q ? 'filtrado' : ''}</b> · ${list.length} ${list.length === 1 ? 'lançamento' : 'lançamentos'}</td><td class="tnum fv"><b>${tab === 'fd' ? '−' : ''}${brl(tot)}</b></td><td></td></tr></tfoot></table></div>`
      : `<div class="empty" style="padding:22px"><p>${q ? 'Nada encontrado.' : `Nenhum ${FT[tab].one} lançado.`}</p>${isFd && !q ? '<p class="muted" style="font-size:12.5px">Exemplo: “Compra de 500 tijolos”, fornecedor e NF. O valor abate do valor da obra e do saldo a pagar.</p>' : ''}</div>`;
  }
  const lists = `<div class="card fin-l rise" style="--i:4">${tabs}
    ${tab !== 'log' && tab !== 'ativ' ? `<div class="fin-tb"><label class="field f-search">${ic('busca')}<input class="inp" id="fin-q" type="search" placeholder="Buscar descrição, fornecedor ou NF" value="${esc(S.finQ)}" autocomplete="off" aria-label="Buscar lançamentos"></label><span class="sp"></span><button class="btn" data-act="fin-xlsx">${ic('down')}Excel</button><button class="btn primary" data-act="fin-new" data-t="${tab}">${ic('plus')}${FT[tab].novo}</button></div>` : ''}
    ${body}</div>`;
  return `<div class="dwrap fin">${al.map(m => `<div class="banner fin-al">${ic('s_alert')}<span>${m}</span></div>`).join('')}${kpis}${cmp}${lists}</div>`;
}
function afterFin(host) {
  const pid = S.proj; if (!finVisible(pid)) return;
  loadFin(pid);
  const el = host && host.querySelector('#fchart'); if (el && S.finChart && S.finChart.pid === pid) drawFinChart(el, pid, S.finChart.pays, S.finChart.aj, S.finChart.ex);
  if (!S.finCh || S.finCh.pid !== pid) {
    if (S.finCh) try { sb.removeChannel(S.finCh.ch); } catch (e) {}
    const re = () => { clearTimeout(S.finChT); S.finChT = setTimeout(() => loadFin(pid, true), 300); };
    const ch = sb.channel('fin-' + pid).on('postgres_changes', { event: '*', schema: 'public', table: 'fin_itens', filter: 'project_id=eq.' + pid }, re)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_contratos', filter: 'project_id=eq.' + pid }, re)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_valores', filter: 'project_id=eq.' + pid }, re).subscribe();
    S.finCh = { pid, ch };
  }
}
function openFinContrato() {
  const pid = S.proj, D = S.finD[pid] || {}, c = D.contrato;
  openModal(`<form id="ffc" novalidate><div class="md-h"><h3>Valor do contrato</h3><p>${esc(projName(pid))}. Aditivos e faturamento direto são lançados à parte e ajustam este valor automaticamente.</p></div>
    <div class="md-b"><div class="f"><label for="fc-v">Valor total do contrato (R$) <span class="req">*</span></label><input class="inp money" id="fc-v" inputmode="decimal" value="${c ? brlIn(c.valor) : ''}" placeholder="0,00" autocomplete="off"></div>
    <div class="f"><label for="fc-o">Observação</label><input class="inp" id="fc-o" maxlength="200" value="${esc(c ? c.obs : '')}" placeholder="Ex.: Contrato nº 123/2026"></div><p class="err" id="fc-err" role="alert"></p></div>
    <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form>`);
  $('#ffc').addEventListener('submit', async e => {
    e.preventDefault(); const v = parseBRL($('#fc-v').value), er = $('#fc-err');
    if (isNaN(v) || v < 0) { er.textContent = 'Informe um valor válido, por exemplo 250.000,00.'; return; }
    const { error } = await sb.from('fin_contratos').upsert({ project_id: pid, valor: v, obs: $('#fc-o').value.trim() }, { onConflict: 'project_id' });
    if (error) { er.textContent = dbErr(error).message; return; }
    closeModal(); toast('Valor do contrato salvo.', 'ok'); loadFin(pid, true);
  });
}
function openFinItem(id, tipo0, pre = {}) {
  const pid = pre.pid || S.proj, D = S.finD[pid] || {}, x = id ? (D.itens || []).find(i => i.id === id) : null, tipo = x ? x.tipo : tipo0 || 'pagamento';
  if (id && !x) return;
  const sign = x && x.tipo === 'aditivo' && x.valor < 0 ? '-' : '+';
  openModal(`<form id="ffi" novalidate><div class="md-h"><h3>${x ? 'Editar lançamento' : FT[tipo].novo}</h3><p>${esc(projName(pid))}</p></div>
    <div class="md-b">
      <div class="f"><span class="lab">Tipo</span><div class="seg-ctl">${['pagamento', 'fd', 'aditivo'].map(t => `<label><input type="radio" name="fi-t" value="${t}" ${tipo === t ? 'checked' : ''}>${t === 'fd' ? 'Faturamento direto' : t === 'pagamento' ? 'Pagamento' : 'Aditivo'}</label>`).join('')}</div>
        <span class="hint" id="fi-hint"></span></div>
      <div class="cols2"><div class="f"><label for="fi-d">Data <span class="req">*</span></label><input class="inp" type="date" id="fi-d" value="${esc(x ? x.data : ISO(today()))}"></div>
        <div class="f"><label for="fi-nf">NF / documento</label><input class="inp" id="fi-nf" maxlength="60" value="${esc(x ? x.nf : '')}"></div></div>
      <div class="f"><label for="fi-ds">Descrição <span class="req">*</span></label><input class="inp" id="fi-ds" maxlength="300" value="${esc(x ? x.descricao : '')}" placeholder="Ex.: Compra de 500 tijolos"></div>
      <div class="cols2" id="fi-refw"><div class="f"><label for="fi-ref">Referente a</label><select class="sel" id="fi-ref">${refOptions(pid, x ? x.atividade_id : pre.aid, x ? x.etapa_id : pre.sid)}</select><span class="hint">Liga o lançamento a uma atividade ou etapa para acompanhar o pago de cada uma.</span></div>
        <div class="f" id="fi-medw"><label for="fi-med">Nº da medição</label><input class="inp" id="fi-med" maxlength="40" value="${esc(x ? x.medicao || '' : '')}" placeholder="opcional"></div></div>
      <div class="f"><label for="fi-fo" id="fi-fol">Fornecedor</label><input class="inp" id="fi-fo" maxlength="160" value="${esc(x ? x.fornecedor : '')}"></div>
      <div class="fi-calc" id="fi-calc"><div class="f"><label for="fi-q">Quantidade</label><input class="inp" id="fi-q" inputmode="decimal" placeholder="500"></div><span class="x">×</span><div class="f"><label for="fi-u">Valor unitário (R$)</label><input class="inp money" id="fi-u" inputmode="decimal" placeholder="1,20"></div><span class="hint">Opcional: calcula o valor total.</span></div>
      <div class="cols2"><div class="f" id="fi-sgw"><span class="lab">Aditivo</span><div class="seg-ctl"><label><input type="radio" name="fi-sg" value="+" ${sign === '+' ? 'checked' : ''}>Acréscimo</label><label><input type="radio" name="fi-sg" value="-" ${sign === '-' ? 'checked' : ''}>Supressão</label></div></div>
        <div class="f"><label for="fi-v">Valor (R$) <span class="req">*</span></label><input class="inp money" id="fi-v" inputmode="decimal" value="${x ? brlIn(Math.abs(x.valor)) : ''}" placeholder="0,00" autocomplete="off"></div></div>
      <p class="err" id="fi-err" role="alert"></p></div>
    <div class="md-f">${x ? `<button type="button" class="btn danger sm" data-act="fin-del" data-id="${x.id}" data-p="${pid}" style="margin-right:auto">${ic('lixo')}Excluir</button>` : ''}<button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">${x ? 'Salvar' : 'Lançar'}</button></div></form>`);
  const sync = () => {
    const t = ($('input[name="fi-t"]:checked') || {}).value;
    $('#fi-calc').hidden = t !== 'fd'; $('#fi-sgw').style.visibility = t === 'aditivo' ? '' : 'hidden';
    $('#fi-refw').hidden = t === 'aditivo'; $('#fi-medw').style.visibility = t === 'pagamento' ? '' : 'hidden';
    $('#fi-fol').textContent = t === 'fd' ? 'Fornecedor' : t === 'pagamento' ? 'Referência (ex.: medição 3)' : 'Motivo ou documento';
    $('#fi-hint').textContent = t === 'fd' ? 'Compra paga direto pelo cliente: abate do valor da obra e do saldo a pagar.' : t === 'pagamento' ? 'Valor pago à executora. Reduz o saldo a pagar.' : 'Muda o valor do contrato: acréscimo soma, supressão subtrai.';
  };
  $$('input[name="fi-t"]').forEach(r => r.addEventListener('change', sync)); sync();
  const calcV = () => { const q = parseBRL($('#fi-q').value), u = parseBRL($('#fi-u').value); if (!isNaN(q) && !isNaN(u)) $('#fi-v').value = brlIn(Math.round(q * u * 100) / 100); };
  $('#fi-q').addEventListener('input', calcV); $('#fi-u').addEventListener('input', calcV);
  $('#ffi').addEventListener('submit', async e => {
    e.preventDefault(); const er = m => { $('#fi-err').textContent = m; };
    const t = ($('input[name="fi-t"]:checked') || {}).value, d = $('#fi-d').value, ds = $('#fi-ds').value.trim();
    let v = parseBRL($('#fi-v').value);
    if (P(d) == null) return er('Informe a data.');
    if (!ds) return er('Informe a descrição.');
    if (isNaN(v) || v <= 0) return er('Informe um valor maior que zero, por exemplo 1.250,00.');
    if (t === 'aditivo' && ($('input[name="fi-sg"]:checked') || {}).value === '-') v = -v;
    const [ra, rs] = t === 'aditivo' ? ['', ''] : ($('#fi-ref').value || '|').split('|');
    const row = { project_id: pid, tipo: t, data: d, descricao: ds, fornecedor: $('#fi-fo').value.trim(), nf: $('#fi-nf').value.trim(), valor: v, atividade_id: ra || null, etapa_id: rs || null, medicao: t === 'pagamento' ? $('#fi-med').value.trim() : '' };
    const btn = e.submitter || $('#ffi button[type=submit]'); btn.disabled = true;
    const r = x ? await sb.from('fin_itens').update(row).eq('id', x.id) : await sb.from('fin_itens').insert(row);
    if (r.error) { btn.disabled = false; return er(dbErr(r.error).message); }
    closeModal(); toast(x ? 'Lançamento atualizado.' : `${t === 'fd' ? 'Compra' : t === 'pagamento' ? 'Pagamento' : 'Aditivo'} de ${brl(Math.abs(v))} lançado.`, 'ok');
    if (S.view === 'financeiro' && S.finTab !== 'ativ') S.finTab = t; loadFin(pid, true);
  });
}
async function delFinItem(id, btn) {
  if (!armed(btn, 'Confirmar exclusão')) return;
  const pid = btn.dataset.p || S.proj, x = ((S.finD[pid] || {}).itens || []).find(i => i.id === id);
  const { error } = await sb.from('fin_itens').delete().eq('id', id);
  if (error) { toast(dbErr(error).message, 'err'); return; }
  closeModal(); loadFin(pid, true);
  if (x) { const back = { ...x }; delete back.created_at; delete back.created_by; delete back.updated_at; delete back.updated_by; toast('Lançamento excluído.', '', 'Desfazer', async () => { const r = await sb.from('fin_itens').insert(back); if (!r.error) loadFin(pid, true); }); }
}
async function exportFin() {
  const pid = S.proj, D = S.finD[pid]; if (!D || !D.loaded) return;
  let XL; try { XL = await loadExcel(); } catch (e) { toast('Não foi possível carregar o gerador de Excel.', 'err'); return; }
  const wb = new XL.Workbook(), k = finTotals(D), money = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const ws = wb.addWorksheet('Resumo'); ws.columns = [{ header: 'Item', key: 'a', width: 34 }, { header: 'Valor', key: 'b', width: 20 }];
  [['Projeto', projName(pid)], ['Valor do contrato', k.contrato], ['Aditivos', k.aditivos], ['Faturamento direto (abatido)', -k.fd], ['Valor ajustado', k.aj], ['Pago até hoje', k.pago], ['A pagar', k.aPagar], ['% pago do ajustado', Math.round(k.pct) / 100], ['Avanço físico', Math.round(metaStats(pid, allActs()).prog) / 100]].forEach(([a, b], i) => { const r = ws.addRow({ a, b }); if (typeof b === 'number') r.getCell(2).numFmt = i >= 7 ? '0%' : money; });
  ws.getRow(1).font = { bold: true };
  const F = finPlan(pid);
  if (F) {
    const wa = wb.addWorksheet('Por atividade');
    wa.columns = [{ header: 'Código', key: 'c', width: 10 }, { header: 'Atividade', key: 'a', width: 44 }, { header: 'Etapa', key: 'e', width: 28 }, { header: 'Valor', key: 'v', width: 16 }, { header: 'Origem do valor', key: 'o', width: 14 }, { header: 'Físico', key: 'f', width: 9 }, { header: 'Executado', key: 'x', width: 16 }, { header: 'Pago', key: 'p', width: 16 }, { header: 'FD', key: 'd', width: 14 }, { header: 'A medir', key: 'm', width: 16 }, { header: 'Saldo', key: 's', width: 16 }];
    wa.getRow(1).font = { bold: true };
    const add = (o, bold) => { const r = wa.addRow(o); [4, 7, 8, 9, 10, 11].forEach(c => r.getCell(c).numFmt = money); r.getCell(6).numFmt = '0%'; if (bold) r.font = { bold: true }; };
    F.rows.forEach(r => { add({ c: r.x.a.codigo || '', a: r.x.a.titulo, e: '', v: r.valor, o: r.auto ? 'automático' : r.anyS && r.mA == null ? 'soma etapas' : 'definido', f: r.fis / 100, x: r.exec, p: r.pago, d: -r.fd, m: r.aMedir, s: r.saldo }, !!r.units);
      (r.units || []).forEach(u => add({ c: '', a: '', e: `E${u.si + 1} · ${u.s.nome}`, v: u.valor, o: u.manual ? 'definido' : 'automático', f: u.fis / 100, x: u.exec, p: u.pago, d: -u.fd, m: u.aMedir, s: u.saldo })); });
    add({ c: '', a: 'Total', e: '', v: F.dist, o: '', f: F.execPct / 100, x: F.exec, p: F.rows.reduce((t, r) => t + r.pago, 0) + F.pagoGeral, d: -(F.rows.reduce((t, r) => t + r.fd, 0) + F.fdGeral), m: F.aMedir, s: F.rows.reduce((t, r) => t + r.saldo, 0) - F.pagoGeral - F.fdGeral }, true);
  }
  ['pagamento', 'fd', 'aditivo'].forEach(t => {
    const s = wb.addWorksheet(FT[t].l.slice(0, 31)); s.columns = [{ header: 'Data', key: 'd', width: 12 }, { header: 'Descrição', key: 'ds', width: 50 }, { header: t === 'fd' ? 'Fornecedor' : 'Referência', key: 'f', width: 28 }, { header: 'NF', key: 'nf', width: 14 }, { header: 'Valor', key: 'v', width: 16 }, { header: 'Referente a', key: 'ref', width: 40 }, { header: 'Medição', key: 'med', width: 10 }];
    s.getRow(1).font = { bold: true };
    (D.itens || []).filter(x => x.tipo === t).sort((a, b) => String(a.data).localeCompare(String(b.data))).forEach(x => { const tmp = document.createElement('div'); tmp.innerHTML = refLabel(x); const r = s.addRow({ d: fd(P(x.data)), ds: x.descricao, f: x.fornecedor, nf: x.nf, v: x.valor, ref: tmp.textContent.trim(), med: x.medicao || '' }); r.getCell(5).numFmt = money; });
  });
  try { const buf = await wb.xlsx.writeBuffer(); await downloads.save({ filename: `financeiro-${norm(projName(pid)).replace(/[^a-z0-9]+/g, '-')}-${ISO(today())}.xlsx`, data: new Blob([buf]) }); toast('Financeiro exportado.', 'ok'); }
  catch (e) { toast('Não foi possível gerar o arquivo.', 'err'); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  switch (t.dataset.act) {
    case 'fin-tab': S.finTab = t.dataset.t; render(); break;
    case 'fin-new': openFinItem(null, t.dataset.t); break;
    case 'fin-edit': e.stopPropagation(); openFinItem(t.dataset.id, null, { pid: t.dataset.p }); break;
    case 'fin-del': delFinItem(t.dataset.id, t); break;
    case 'fin-contrato': openFinContrato(); break;
    case 'fin-reload': loadFin(S.proj, true); break;
    case 'fin-xlsx': exportFin(); break;
  }
});
let finQT = 0;
document.addEventListener('input', e => { if (e.target.id === 'fin-q') { S.finQ = e.target.value; clearTimeout(finQT); finQT = setTimeout(render, 140); } });
