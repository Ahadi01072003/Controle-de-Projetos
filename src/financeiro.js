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
S.finD = {}; S.finR = {}; S.finTab = 'pagamento'; S.finQ = '';

async function loadFin(pid, force) {
  const D = S.finD[pid] || (S.finD[pid] = { loaded: false, loading: false });
  if (D.loading || (D.loaded && !force)) return;
  D.loading = true;
  try {
    const [c, i, l] = await Promise.all([
      sb.from('fin_contratos').select('*').eq('project_id', pid).maybeSingle(),
      sb.from('fin_itens').select('*').eq('project_id', pid).order('data', { ascending: false }),
      sb.from('fin_log').select('*').eq('project_id', pid).order('em', { ascending: false }).limit(80)]);
    if (c.error || i.error || l.error) throw (c.error || i.error || l.error);
    Object.assign(D, { contrato: c.data || null, itens: (i.data || []).map(x => ({ ...x, valor: +x.valor })), log: l.data || [], loaded: true, err: false });
  } catch (e) { D.err = true; }
  D.loading = false; S.finR[pid] = null; schedule();
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

/* ---------- curva físico × financeiro ---------- */
function finSeries(pid, pagamentos, aj) {
  const L = live(allActs().filter(x => x.a.metaId === pid)), T = today();
  const pays = pagamentos.map(p => ({ d: P(String(p.d || p.data).slice(0, 10)), v: +p.v || +p.valor || 0 })).filter(p => p.d != null).sort((a, b) => a.d - b.d);
  const starts = L.map(x => x.c.ip).filter(n => n != null);
  let d0 = Math.min(...starts, ...(pays.length ? [pays[0].d] : []), T), d1 = Math.max(T, ...(pays.length ? [pays[pays.length - 1].d] : []));
  if (!isFinite(d0)) d0 = T - 30; if (d1 - d0 < 14) d0 = d1 - 14;
  const n = 36, pts = [];
  for (let k = 0; k <= n; k++) {
    const D = Math.round(d0 + (d1 - d0) * k / n);
    const fis = L.length ? projDay(L, D).real : 0;
    const pago = pays.filter(p => p.d <= D).reduce((s, p) => s + p.v, 0);
    pts.push({ D, fis, fin: aj > 0 ? Math.min(150, pago / aj * 100) : 0 });
  }
  return { pts, d0, d1 };
}
function finChart(pid, pagamentos, aj) {
  const { pts, d0, d1 } = finSeries(pid, pagamentos, aj), W = 640, H = 210, pl = 36, pr = 10, pt = 10, pb = 26;
  const mx = Math.max(100, ...pts.map(p => p.fin));
  const X = D => pl + (D - d0) / (d1 - d0 || 1) * (W - pl - pr), Y = v => pt + (1 - v / mx) * (H - pt - pb);
  const line = k => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.D).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
  const T = today(), months = [];
  for (let d = d0; d <= d1; d++) { const dt = Dt(d); if (dt.getUTCDate() === 1) months.push(d); }
  const last = pts[pts.length - 1];
  return `<svg class="fchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Avanço físico e financeiro ao longo do tempo">
    ${[0, 50, 100].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
    ${months.map(d => `<text x="${X(d)}" y="${H - 8}" text-anchor="middle">${MES[Dt(d).getUTCMonth()]}</text>`).join('')}
    ${T >= d0 && T <= d1 ? `<line x1="${X(T)}" x2="${X(T)}" y1="${pt}" y2="${H - pb}" class="today"/>` : ''}
    <path d="${line('fis')}" class="l-fis draw" pathLength="1"/><path d="${line('fin')}" class="l-fin draw" pathLength="1"/>
    <circle cx="${X(last.D)}" cy="${Y(last.fis)}" r="3.5" class="d-fis"/><circle cx="${X(last.D)}" cy="${Y(last.fin)}" r="3.5" class="d-fin"/></svg>`;
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
  const k = finTotals(D), fis = metaStats(pid, allActs()).prog, al = finAlerts(k);
  const kpi = (i, l, v, foot, c = '', act = '') => `<div class="kpi rise ${act ? 'click' : ''}" style="--i:${i}" ${act} ${act ? 'tabindex="0"' : ''}><div class="lbl">${l}</div><div class="val fval ${c}">${v}</div><div class="foot">${foot}</div></div>`;
  const kpis = `<div class="card kpis fin-k">
    ${kpi(0, 'Valor do contrato', brl(k.contrato), D.contrato && D.contrato.obs ? esc(D.contrato.obs) : 'clique para editar', '', 'data-act="fin-contrato"')}
    ${kpi(1, 'Aditivos', (k.aditivos > 0 ? '+' : '') + brl(k.aditivos), (n => `${n} ${n === 1 ? 'registrado' : 'registrados'}`)((D.itens || []).filter(x => x.tipo === 'aditivo').length))}
    ${kpi(2, 'Faturamento direto', '−' + brl(k.fd), 'abatido do valor da obra')}
    ${kpi(3, 'Valor ajustado', brl(k.aj), 'contrato + aditivos − faturamento direto', 'strong')}
    ${kpi(4, 'Pago até hoje', brl(k.pago), `${Math.round(k.pct)}% do valor ajustado`)}
    ${kpi(5, 'A pagar', brl(k.aPagar), k.aPagar < 0 ? 'pago acima do ajustado' : 'saldo restante', k.aPagar < 0 ? 'neg' : 'strong')}</div>`;
  const pays = (D.itens || []).filter(x => x.tipo === 'pagamento').map(x => ({ d: x.data, v: x.valor }));
  const cmp = `<div class="card fin-cmp rise" style="--i:3"><div class="card-h"><h2>Físico × financeiro</h2><div class="lkeys"><span><i style="--c:var(--ink)"></i>Avanço físico</span><span><i style="--c:var(--fin)"></i>Pago (% do ajustado)</span></div></div>
    <div class="fin-cmp-b">${finCompareHTML(k, fis)}<div class="fchart-w">${finChart(pid, pays, k.aj)}</div></div></div>`;
  const tab = S.finTab, all = (D.itens || []).filter(x => x.tipo === tab), q = norm(S.finQ);
  const list = all.filter(x => !q || norm([x.descricao, x.fornecedor, x.nf].join(' ')).includes(q)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.created_at).localeCompare(String(a.created_at)));
  const tot = list.reduce((s, x) => s + x.valor, 0);
  const tabs = `<div class="fin-tabs" role="tablist">${['pagamento', 'fd', 'aditivo'].map(t => `<button role="tab" aria-selected="${tab === t}" class="${tab === t ? 'on' : ''}" data-act="fin-tab" data-t="${t}">${FT[t].l}<b>${(D.itens || []).filter(x => x.tipo === t).length}</b></button>`).join('')}<button role="tab" aria-selected="${tab === 'log'}" class="${tab === 'log' ? 'on' : ''}" data-act="fin-tab" data-t="log">Histórico</button></div>`;
  let body;
  if (tab === 'log') {
    const A = { insert: 'lançou', update: 'alterou', delete: 'excluiu' };
    body = (D.log || []).length ? `<ul class="rp-list fin-log">${D.log.map(l => { const it = l.acao === 'update' ? (l.item.depois || {}) : l.item, an = l.acao === 'update' ? (l.item.antes || {}) : null;
      const what = l.tipo === 'contrato' ? `valor do contrato ${an && an.valor != null ? brl(an.valor) + ' → ' : ''}${brl(it.valor)}` : `${FT[l.tipo] ? FT[l.tipo].one : l.tipo}: ${esc(it.descricao || '')} · ${an && an.valor !== it.valor ? brl(an.valor) + ' → ' : ''}${brl(it.valor)}`;
      return `<li><span class="mono muted">${new Date(l.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span><span><b>${esc(personName(l.por) || 'alguém')}</b> ${A[l.acao] || l.acao} ${what}</span></li>`; }).join('')}</ul>` : '<p class="muted">Nenhuma alteração registrada ainda.</p>';
  } else {
    const isFd = tab === 'fd';
    body = list.length ? `<div class="tbl-wrap" style="max-height:none;box-shadow:none"><table class="tbl ftbl cardify"><thead><tr><th>Data</th><th>Descrição</th><th>${isFd ? 'Fornecedor' : tab === 'pagamento' ? 'Referência' : 'Motivo / documento'}</th><th>NF / doc.</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr class="row" data-act="fin-edit" data-id="${x.id}" tabindex="0"><td class="mono" data-l="Data">${fd(P(x.data))}</td><td class="ttl" data-l="Descrição"><div>${esc(x.descricao)}</div></td><td data-l="${isFd ? 'Fornecedor' : 'Referência'}">${esc(x.fornecedor) || '<span class="muted">—</span>'}</td><td class="mono" data-l="NF">${esc(x.nf) || '<span class="muted">—</span>'}</td><td class="tnum fv ${x.valor < 0 ? 'neg' : ''}" data-l="Valor">${tab === 'fd' ? '−' : x.valor > 0 && tab === 'aditivo' ? '+' : ''}${brl(x.valor)}</td><td><button class="btn icon ghost sm" data-act="fin-edit" data-id="${x.id}" aria-label="Editar">${ic('editar')}</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4"><b>Total ${q ? 'filtrado' : ''}</b> · ${list.length} ${list.length === 1 ? 'lançamento' : 'lançamentos'}</td><td class="tnum fv"><b>${tab === 'fd' ? '−' : ''}${brl(tot)}</b></td><td></td></tr></tfoot></table></div>`
      : `<div class="empty" style="padding:22px"><p>${q ? 'Nada encontrado.' : `Nenhum ${FT[tab].one} lançado.`}</p>${isFd && !q ? '<p class="muted" style="font-size:12.5px">Exemplo: “Compra de 500 tijolos”, fornecedor e NF. O valor abate do valor da obra e do saldo a pagar.</p>' : ''}</div>`;
  }
  const lists = `<div class="card fin-l rise" style="--i:4">${tabs}
    ${tab !== 'log' ? `<div class="fin-tb"><label class="field f-search">${ic('busca')}<input class="inp" id="fin-q" type="search" placeholder="Buscar descrição, fornecedor ou NF" value="${esc(S.finQ)}" autocomplete="off" aria-label="Buscar lançamentos"></label><span class="sp"></span><button class="btn" data-act="fin-xlsx">${ic('down')}Excel</button><button class="btn primary" data-act="fin-new" data-t="${tab}">${ic('plus')}${FT[tab].novo}</button></div>` : ''}
    ${body}</div>`;
  return `<div class="dwrap fin">${al.map(m => `<div class="banner fin-al">${ic('s_alert')}<span>${m}</span></div>`).join('')}${kpis}${cmp}${lists}</div>`;
}
function afterFin() {
  const pid = S.proj; if (!finVisible(pid)) return;
  loadFin(pid);
  if (!S.finCh || S.finCh.pid !== pid) {
    if (S.finCh) try { sb.removeChannel(S.finCh.ch); } catch (e) {}
    const re = () => { clearTimeout(S.finChT); S.finChT = setTimeout(() => loadFin(pid, true), 300); };
    const ch = sb.channel('fin-' + pid).on('postgres_changes', { event: '*', schema: 'public', table: 'fin_itens', filter: 'project_id=eq.' + pid }, re)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_contratos', filter: 'project_id=eq.' + pid }, re).subscribe();
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
function openFinItem(id, tipo0) {
  const pid = S.proj, D = S.finD[pid] || {}, x = id ? (D.itens || []).find(i => i.id === id) : null, tipo = x ? x.tipo : tipo0 || 'pagamento';
  const sign = x && x.tipo === 'aditivo' && x.valor < 0 ? '-' : '+';
  openModal(`<form id="ffi" novalidate><div class="md-h"><h3>${x ? 'Editar lançamento' : FT[tipo].novo}</h3><p>${esc(projName(pid))}</p></div>
    <div class="md-b">
      <div class="f"><span class="lab">Tipo</span><div class="seg-ctl">${['pagamento', 'fd', 'aditivo'].map(t => `<label><input type="radio" name="fi-t" value="${t}" ${tipo === t ? 'checked' : ''}>${t === 'fd' ? 'Faturamento direto' : t === 'pagamento' ? 'Pagamento' : 'Aditivo'}</label>`).join('')}</div>
        <span class="hint" id="fi-hint"></span></div>
      <div class="cols2"><div class="f"><label for="fi-d">Data <span class="req">*</span></label><input class="inp" type="date" id="fi-d" value="${esc(x ? x.data : ISO(today()))}"></div>
        <div class="f"><label for="fi-nf">NF / documento</label><input class="inp" id="fi-nf" maxlength="60" value="${esc(x ? x.nf : '')}"></div></div>
      <div class="f"><label for="fi-ds">Descrição <span class="req">*</span></label><input class="inp" id="fi-ds" maxlength="300" value="${esc(x ? x.descricao : '')}" placeholder="Ex.: Compra de 500 tijolos"></div>
      <div class="f"><label for="fi-fo" id="fi-fol">Fornecedor</label><input class="inp" id="fi-fo" maxlength="160" value="${esc(x ? x.fornecedor : '')}"></div>
      <div class="fi-calc" id="fi-calc"><div class="f"><label for="fi-q">Quantidade</label><input class="inp" id="fi-q" inputmode="decimal" placeholder="500"></div><span class="x">×</span><div class="f"><label for="fi-u">Valor unitário (R$)</label><input class="inp money" id="fi-u" inputmode="decimal" placeholder="1,20"></div><span class="hint">Opcional: calcula o valor total.</span></div>
      <div class="cols2"><div class="f" id="fi-sgw"><span class="lab">Aditivo</span><div class="seg-ctl"><label><input type="radio" name="fi-sg" value="+" ${sign === '+' ? 'checked' : ''}>Acréscimo</label><label><input type="radio" name="fi-sg" value="-" ${sign === '-' ? 'checked' : ''}>Supressão</label></div></div>
        <div class="f"><label for="fi-v">Valor (R$) <span class="req">*</span></label><input class="inp money" id="fi-v" inputmode="decimal" value="${x ? brlIn(Math.abs(x.valor)) : ''}" placeholder="0,00" autocomplete="off"></div></div>
      <p class="err" id="fi-err" role="alert"></p></div>
    <div class="md-f">${x ? `<button type="button" class="btn danger sm" data-act="fin-del" data-id="${x.id}" style="margin-right:auto">${ic('lixo')}Excluir</button>` : ''}<button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">${x ? 'Salvar' : 'Lançar'}</button></div></form>`);
  const sync = () => {
    const t = ($('input[name="fi-t"]:checked') || {}).value;
    $('#fi-calc').hidden = t !== 'fd'; $('#fi-sgw').style.visibility = t === 'aditivo' ? '' : 'hidden';
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
    const row = { project_id: pid, tipo: t, data: d, descricao: ds, fornecedor: $('#fi-fo').value.trim(), nf: $('#fi-nf').value.trim(), valor: v };
    const btn = e.submitter || $('#ffi button[type=submit]'); btn.disabled = true;
    const r = x ? await sb.from('fin_itens').update(row).eq('id', x.id) : await sb.from('fin_itens').insert(row);
    if (r.error) { btn.disabled = false; return er(dbErr(r.error).message); }
    closeModal(); toast(x ? 'Lançamento atualizado.' : `${t === 'fd' ? 'Compra' : t === 'pagamento' ? 'Pagamento' : 'Aditivo'} de ${brl(Math.abs(v))} lançado.`, 'ok');
    S.finTab = t; loadFin(pid, true);
  });
}
async function delFinItem(id, btn) {
  if (!armed(btn, 'Confirmar exclusão')) return;
  const pid = S.proj, x = ((S.finD[pid] || {}).itens || []).find(i => i.id === id);
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
  ['pagamento', 'fd', 'aditivo'].forEach(t => {
    const s = wb.addWorksheet(FT[t].l.slice(0, 31)); s.columns = [{ header: 'Data', key: 'd', width: 12 }, { header: 'Descrição', key: 'ds', width: 50 }, { header: t === 'fd' ? 'Fornecedor' : 'Referência', key: 'f', width: 28 }, { header: 'NF', key: 'nf', width: 14 }, { header: 'Valor', key: 'v', width: 16 }];
    s.getRow(1).font = { bold: true };
    (D.itens || []).filter(x => x.tipo === t).sort((a, b) => String(a.data).localeCompare(String(b.data))).forEach(x => { const r = s.addRow({ d: fd(P(x.data)), ds: x.descricao, f: x.fornecedor, nf: x.nf, v: x.valor }); r.getCell(5).numFmt = money; });
  });
  try { const buf = await wb.xlsx.writeBuffer(); await downloads.save({ filename: `financeiro-${norm(projName(pid)).replace(/[^a-z0-9]+/g, '-')}-${ISO(today())}.xlsx`, data: new Blob([buf]) }); toast('Financeiro exportado.', 'ok'); }
  catch (e) { toast('Não foi possível gerar o arquivo.', 'err'); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  switch (t.dataset.act) {
    case 'fin-tab': S.finTab = t.dataset.t; render(); break;
    case 'fin-new': openFinItem(null, t.dataset.t); break;
    case 'fin-edit': e.stopPropagation(); openFinItem(t.dataset.id); break;
    case 'fin-del': delFinItem(t.dataset.id, t); break;
    case 'fin-contrato': openFinContrato(); break;
    case 'fin-reload': loadFin(S.proj, true); break;
    case 'fin-xlsx': exportFin(); break;
  }
});
let finQT = 0;
document.addEventListener('input', e => { if (e.target.id === 'fin-q') { S.finQ = e.target.value; clearTimeout(finQT); finQT = setTimeout(render, 140); } });
