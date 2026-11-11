/* ===================== FINANCEIRO POR ATIVIDADE E ETAPA ===================== */
/* Base = contrato + aditivos (valor da obra). Atividade ou etapa pode ter valor definido; por padrão
   o que falta é distribuído pelo peso entre as atividades sem valor, então a soma fecha com o contrato.
   Executado = valor × avanço físico. FD ligado a uma atividade abate dentro dela.
   A medir = executado − pago − FD da atividade (negativo = pago adiantado). */
const VK = (a, s) => a + ':' + (s || '');
const r2 = v => Math.round((+v || 0) * 100) / 100;
function spread(total, ws) { // reparte o total pelos pesos, em centavos, fechando exato
  const W = ws.reduce((a, b) => a + b, 0); if (!W || total <= 0) return ws.map(() => 0);
  const out = ws.map(w => Math.floor(total * w / W * 100) / 100);
  let rest = r2(total - out.reduce((a, b) => a + b, 0));
  for (let i = out.length - 1; rest > 0.004 && i >= 0; i--) if (ws[i]) { out[i] = r2(out[i] + rest); rest = 0; }
  return out;
}
let fpMemo = { k: '', v: null };
function finPlan(pid) {
  const D = S.finD[pid]; if (!D || !D.loaded) return null;
  const key = S.ver + '|' + pid + '|' + (D.v || 0) + '|' + today();
  if (fpMemo.k === key) return fpMemo.v;
  const k = finTotals(D), base = r2(k.contrato + k.aditivos), auto = !D.contrato || D.contrato.auto_dist !== false;
  const man = new Map((D.valores || []).map(v => [VK(v.atividade_id, v.etapa_id), +v.valor]));
  const xs = live(allActs().filter(x => x.a.metaId === pid)).sort(SORTS.codigo);
  const rows = xs.map(x => {
    const subs = subsOf(x.a), mA = man.get(VK(x.a.id, '')), mS = subs.map(s => man.get(VK(x.a.id, s.id))), anyS = mS.some(v => v != null);
    return { x, subs, mA, mS, anyS, w: +x.a.peso || 1, fixed: mA != null ? mA : anyS ? r2(mS.reduce((t, v) => t + (v || 0), 0)) : null };
  });
  const free = rows.filter(r => r.fixed == null), rem = r2(base - rows.reduce((t, r) => t + (r.fixed ?? 0), 0));
  const sp = auto ? spread(rem, free.map(r => r.w)) : free.map(() => 0);
  free.forEach((r, i) => { r.valor = sp[i]; r.auto = true; });
  rows.forEach(r => { if (r.fixed != null) { r.valor = r.fixed; r.auto = false; } });
  const itens = D.itens || [], ids = new Set(rows.map(r => r.x.a.id));
  const sumBy = (t, aid, sid) => r2(itens.filter(i => i.tipo === t && i.atividade_id === aid && (sid === undefined || (i.etapa_id || '') === sid)).reduce((s, i) => s + i.valor, 0));
  rows.forEach(r => {
    const aid = r.x.a.id, sc = r.x.c.subs || [];
    r.pago = sumBy('pagamento', aid); r.fd = sumBy('fd', aid);
    if (r.subs.length) {
      const manSum = r.mS.reduce((t, v) => t + (v || 0), 0), fw = r.subs.map((s, i) => r.mS[i] == null ? (+s.peso || 1) : 0);
      const spS = spread(r2(Math.max(0, r.valor - manSum)), fw);
      r.units = r.subs.map((s, i) => {
        const c = sc[i], f = c ? (c.done ? 1 : (c.prog || 0) / 100) : 0, valor = r.mS[i] != null ? r.mS[i] : spS[i];
        const u = { s, si: i, c, manual: r.mS[i] != null, valor, fis: f * 100, exec: r2(valor * f), pago: sumBy('pagamento', aid, s.id), fd: sumBy('fd', aid, s.id) };
        u.aMedir = r2(u.exec - u.pago - u.fd); u.saldo = r2(u.valor - u.pago - u.fd); return u;
      });
      r.exec = r2(r.units.reduce((t, u) => t + u.exec, 0));
      r.over = !r.anyS ? false : r.mA != null && manSum > r.mA + 0.004;
    } else { r.units = null; r.exec = r2(r.valor * r.x.c.valor); }
    r.fis = r.valor > 0 ? r.exec / r.valor * 100 : r.x.c.valor * 100;
    r.aMedir = r2(r.exec - r.pago - r.fd); r.saldo = r2(r.valor - r.pago - r.fd);
  });
  const dist = r2(rows.reduce((t, r) => t + r.valor, 0)), exec = r2(rows.reduce((t, r) => t + r.exec, 0));
  const geral = t => r2(itens.filter(i => i.tipo === t && !(i.atividade_id && ids.has(i.atividade_id))).reduce((s, i) => s + i.valor, 0));
  const v = { base, auto, rows, dist, falta: r2(base - dist), exec, execPct: base > 0 ? exec / base * 100 : 0,
    aMedirAtiv: r2(rows.reduce((t, r) => t + Math.max(0, r.aMedir), 0)),
    adiant: rows.filter(r => r.aMedir < -0.5), pagoGeral: geral('pagamento'), fdGeral: geral('fd') };
  v.aMedir = r2(Math.max(0, v.aMedirAtiv - v.pagoGeral - v.fdGeral));
  fpMemo = { k: key, v }; return v;
}

/* ---------- aba "Por atividade" ---------- */
S.finOpen = new Set();
function finAtivHTML(pid) {
  const F = finPlan(pid); if (!F) return '';
  if (!F.rows.length) return `<div class="empty" style="padding:22px"><p>O projeto ainda não tem atividades.</p></div>`;
  const pct = v => Math.round(v) + '%';
  const vIn = (aid, sid, u) => u.manual
    ? `<div class="fvw"><input class="inp money fvin man" data-a="${aid}" data-s="${sid}" value="${brlIn(u.valor)}" inputmode="decimal" aria-label="Valor"><button type="button" class="fv-x" data-act="fv-clear" data-a="${aid}" data-s="${sid}" data-tip="Voltar ao valor automático" aria-label="Voltar ao automático">${ic('fechar')}</button></div>`
    : `<div class="fvw"><input class="inp money fvin" data-a="${aid}" data-s="${sid}" value="" placeholder="${brlIn(u.valor)}" inputmode="decimal" aria-label="Valor (automático)"><span class="fv-auto" data-tip="Valor automático: parte do saldo pelo peso. Digite para fixar.">auto</span></div>`;
  const medir = v => v < -0.5 ? `<span class="neg" data-tip="Pago acima do executado">−${brl(-v)}</span>` : v > 0.5 ? `<b>${brl(v)}</b>` : '<span class="muted">—</span>';
  const pf = (p, f) => p + f ? `<span ${f ? `data-tip="Pago ${brl(p)} · faturamento direto ${brl(f)}"` : ''}>${brl(p + f)}${f ? '<sup class="fd-m">FD</sup>' : ''}</span>` : '<span class="muted">—</span>';
  const fisBar = f => `<div class="fbar"><i style="width:${Math.min(100, f).toFixed(1)}%"></i></div><span class="tnum">${pct(f)}</span>`;
  const rowsHTML = F.rows.map(r => {
    const a = r.x.a, open = S.finOpen.has(a.id), hasS = !!r.units;
    const valA = hasS && r.anyS && r.mA == null
      ? `<div class="fvw"><span class="fv-sum tnum" data-tip="Soma das etapas">${brl(r.valor)}</span><span class="fv-auto">soma</span></div>`
      : vIn(a.id, '', { manual: r.mA != null, valor: r.valor });
    const head = `<tr class="fa-row ${r.over ? 'warn' : ''}"><td data-l="Atividade"><div class="fa-name">${hasS ? `<button type="button" class="chev-b ${open ? 'open' : ''}" data-act="fa-tog" data-id="${a.id}" aria-expanded="${open}" aria-label="Etapas">${ic('chev')}</button>` : '<span class="chev-sp"></span>'}<span class="mono muted">${esc(a.codigo || '')}</span><b>${esc(a.titulo)}</b>${hasS ? `<span class="muted fa-n">${r.units.length} etapas</span>` : ''}</div>${r.over ? '<div class="fa-warn">As etapas somam mais que o valor da atividade.</div>' : ''}</td>
      <td data-l="Valor">${valA}</td><td data-l="Físico" class="fa-f">${fisBar(r.fis)}</td><td data-l="Executado" class="fv">${brl(r.exec)}</td>
      <td data-l="Pago + FD" class="fv">${pf(r.pago, r.fd)}</td>
      <td data-l="A medir" class="fv">${medir(r.aMedir)}</td><td data-l="Saldo" class="fv">${brl(r.saldo)}</td></tr>`;
    const subs = hasS && open ? r.units.map(u => `<tr class="fa-sub"><td data-l="Etapa"><div class="fa-name"><span class="chev-sp"></span>${etBadge(u.si + 1)}<span>${esc(u.s.nome)}</span></div></td>
      <td data-l="Valor">${vIn(a.id, u.s.id, u)}</td><td data-l="Físico" class="fa-f">${fisBar(u.fis)}</td><td data-l="Executado" class="fv">${brl(u.exec)}</td>
      <td data-l="Pago + FD" class="fv">${pf(u.pago, u.fd)}</td>
      <td data-l="A medir" class="fv">${medir(u.aMedir)}</td><td data-l="Saldo" class="fv">${brl(u.saldo)}</td></tr>`).join('') : '';
    return head + subs;
  }).join('');
  const ok = Math.abs(F.falta) < 0.01;
  const top = `<div class="fa-top"><div class="fa-dist ${ok ? 'ok' : 'warn'}">${ic(ok ? 's_check' : 's_alert')}<span>Distribuído <b>${brl(F.dist)}</b> de <b>${brl(F.base)}</b> (contrato + aditivos) · ${ok ? 'fecha com o contrato' : F.falta > 0 ? `falta distribuir <b>${brl(F.falta)}</b>` : `passou <b>${brl(-F.falta)}</b> do contrato`}</span></div>
    <label class="tog ${F.auto ? 'on' : ''}"><input type="checkbox" id="fin-auto" ${F.auto ? 'checked' : ''}>Distribuir o saldo pelo peso das atividades sem valor</label>
    <span class="sp"></span><button class="btn" data-act="fin-xlsx">${ic('down')}Excel</button><button class="btn primary" data-act="fin-med">${ic('check')}Gerar medição</button></div>
    <p class="muted fa-hint">Digite o valor de uma atividade ou etapa para fixá-lo; as demais dividem o saldo pelo peso. <b>Executado</b> = valor × avanço físico. <b>A medir</b> = executado − pago − faturamento direto da atividade.</p>`;
  const tot = { pago: r2(F.rows.reduce((t, r) => t + r.pago, 0)), fd: r2(F.rows.reduce((t, r) => t + r.fd, 0)), saldo: r2(F.rows.reduce((t, r) => t + r.saldo, 0)) };
  return top + `<div class="tbl-wrap" style="max-height:none;box-shadow:none"><table class="tbl fatbl cardify"><thead><tr><th>Atividade</th><th>Valor</th><th>Físico</th><th style="text-align:right">Executado</th><th style="text-align:right" data-tip="Pagamentos e faturamento direto ligados à atividade">Pago + FD</th><th style="text-align:right">A medir</th><th style="text-align:right">Saldo</th></tr></thead>
    <tbody>${rowsHTML}${F.pagoGeral || F.fdGeral ? `<tr class="fa-geral"><td colspan="4" data-l="">Lançamentos do projeto geral (sem atividade · ligue-os às atividades editando cada um)</td><td class="fv" data-l="Pago + FD">${pf(F.pagoGeral, F.fdGeral)}</td><td></td><td class="fv" data-l="Saldo">−${brl(F.pagoGeral + F.fdGeral)}</td></tr>` : ''}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="fv"><b>${brl(F.dist)}</b></td><td class="fa-f">${fisBar(F.execPct)}</td><td class="fv"><b>${brl(F.exec)}</b></td><td class="fv"><b>${brl(tot.pago + F.pagoGeral + tot.fd + F.fdGeral)}</b></td><td class="fv"><b>${brl(F.aMedir)}</b></td><td class="fv"><b>${brl(tot.saldo - F.pagoGeral - F.fdGeral)}</b></td></tr></tfoot></table></div>`;
}
async function saveValor(pid, aid, sid, txt, el) {
  const v = parseBRL(txt), key = { project_id: pid, atividade_id: aid, etapa_id: sid || '' };
  const had = ((S.finD[pid] || {}).valores || []).some(x => x.atividade_id === aid && (x.etapa_id || '') === (sid || ''));
  let r;
  if (String(txt).trim() === '' || isNaN(v)) { if (!had) return; r = await sb.from('fin_valores').delete().eq('project_id', pid).eq('atividade_id', aid).eq('etapa_id', sid || ''); }
  else if (v < 0) { toast('O valor não pode ser negativo.', 'warn'); return; }
  else r = await sb.from('fin_valores').upsert({ ...key, valor: v }, { onConflict: 'project_id,atividade_id,etapa_id' });
  if (r && r.error) { toast(dbErr(r.error).message, 'err'); return; }
  if (el) el.classList.add('saved');
  await loadFin(pid, true);
}
async function setAutoDist(pid, on) {
  const { error } = await sb.from('fin_contratos').upsert({ project_id: pid, auto_dist: on }, { onConflict: 'project_id' });
  if (error) { toast(dbErr(error).message, 'err'); return; }
  toast(on ? 'O saldo volta a ser distribuído pelo peso.' : 'Distribuição automática desligada: atividades sem valor ficam em R$ 0.', '');
  loadFin(pid, true);
}

/* ---------- gerar medição: um pagamento por atividade ou etapa, com o mesmo nº ---------- */
function medUnits(pid) {
  const F = finPlan(pid), out = [];
  F.rows.forEach(r => {
    const a = r.x.a;
    if (r.units && r.anyS) r.units.forEach(u => out.push({ aid: a.id, sid: u.s.id, code: a.codigo || '', nome: `${a.titulo} · E${u.si + 1} ${u.s.nome}`, fis: u.fis, valor: u.valor, sug: r2(Math.max(0, u.aMedir)) }));
    else out.push({ aid: a.id, sid: '', code: a.codigo || '', nome: a.titulo, fis: r.fis, valor: r.valor, sug: r2(Math.max(0, r.aMedir)) });
  });
  return out;
}
function openMedicao(pid) {
  const D = S.finD[pid]; if (!D || !D.loaded) return;
  const all = medUnits(pid), sugs = all.filter(u => u.sug > 0.004);
  const nums = (D.itens || []).map(i => parseInt(i.medicao, 10)).filter(n => !isNaN(n)), n = (nums.length ? Math.max(...nums) : 0) + 1;
  const row = (u, i) => `<tr><td><input type="checkbox" class="md-ck" data-i="${i}" ${u.sug > 0.004 ? 'checked' : ''} aria-label="Incluir"></td><td><span class="mono muted">${esc(u.code)}</span> ${esc(u.nome)}</td><td class="tnum">${Math.round(u.fis)}%</td><td class="tnum muted" style="text-align:right">${brl(u.sug)}</td><td><input class="inp money md-v" data-i="${i}" value="${u.sug > 0.004 ? brlIn(u.sug) : ''}" placeholder="0,00" inputmode="decimal"></td></tr>`;
  S.medAll = all;
  openModal(`<form id="fmd" novalidate><div class="md-h"><h3>Gerar medição nº ${n}</h3><p>${esc(projName(pid))}. O sistema sugere, para cada atividade, o que foi <b>executado e ainda não pago</b>. Ajuste os valores e marque o que entra.</p></div>
    <div class="md-b">
      <div class="cols2"><div class="f"><label for="md-d">Data do pagamento</label><input class="inp" type="date" id="md-d" value="${ISO(today())}"></div><div class="f"><label for="md-nf">NF / documento</label><input class="inp" id="md-nf" maxlength="60"></div></div>
      <div class="f"><label for="md-n">Nº da medição</label><input class="inp" id="md-n" maxlength="40" value="${n}" style="max-width:140px"></div>
      ${(() => { const F = finPlan(pid), g = r2(F.pagoGeral + F.fdGeral); return g > 0.5 ? `<div class="planhint changed">${ic('s_alert')}<span>Há <b>${brl(g)}</b> pagos sem atividade (projeto geral). A sugestão não os desconta: ligue esses pagamentos às atividades (editando cada um) para a medição ficar exata.</span></div>` : ''; })()}
      ${sugs.length ? '' : '<div class="planhint">' + ic('info') + '<span>Nada executado a pagar agora. Você ainda pode incluir valores manualmente em “Mostrar todas”.</span></div>'}
      <div class="tbl-wrap md-tw"><table class="tbl mdtbl"><colgroup><col style="width:38px"><col><col style="width:70px"><col style="width:130px"><col style="width:150px"></colgroup><thead><tr><th></th><th>Atividade / etapa</th><th>Físico</th><th style="text-align:right">Sugerido</th><th>Valor da medição</th></tr></thead><tbody id="md-rows">${all.map((u, i) => u.sug > 0.004 ? row(u, i) : '').join('')}</tbody></table></div>
      ${all.length > sugs.length ? `<button type="button" class="lnk" id="md-all">Mostrar todas as atividades (${all.length})</button>` : ''}
      <div class="md-tot">Total da medição: <b id="md-tot">R$ 0,00</b></div><p class="err" id="md-err" role="alert"></p></div>
    <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">Lançar medição</button></div></form>`, true);
  const sum = () => { let t = 0; $$('.md-ck').forEach(c => { if (c.checked) { const v = parseBRL($(`.md-v[data-i="${c.dataset.i}"]`).value); if (!isNaN(v)) t += v; } }); $('#md-tot').textContent = brl(t); };
  const box = $('#fmd'); box.addEventListener('input', sum); box.addEventListener('change', sum); sum();
  const ma = $('#md-all'); if (ma) ma.onclick = () => { const keep = {}; $$('.md-ck').forEach(c => keep[c.dataset.i] = [c.checked, $(`.md-v[data-i="${c.dataset.i}"]`).value]); $('#md-rows').innerHTML = all.map(row).join(''); Object.entries(keep).forEach(([i, [ck, v]]) => { $(`.md-ck[data-i="${i}"]`).checked = ck; $(`.md-v[data-i="${i}"]`).value = v; }); ma.remove(); sum(); };
  box.addEventListener('submit', async e => {
    e.preventDefault(); const er = m => { $('#md-err').textContent = m; };
    const d = $('#md-d').value, num = $('#md-n').value.trim(), nf = $('#md-nf').value.trim();
    if (P(d) == null) return er('Informe a data.');
    const rows = [];
    for (const c of $$('.md-ck')) { if (!c.checked) continue; const u = all[+c.dataset.i], v = parseBRL($(`.md-v[data-i="${c.dataset.i}"]`).value); if (isNaN(v) || v <= 0) return er(`Informe um valor maior que zero para ${u.code} ${u.nome}, ou desmarque.`);
      rows.push({ project_id: pid, tipo: 'pagamento', data: d, descricao: `Medição ${num || n} · ${u.code} ${u.nome}`.slice(0, 300), fornecedor: `Medição ${num || n}`, nf, valor: v, atividade_id: u.aid, etapa_id: u.sid || null, medicao: num || String(n) }); }
    if (!rows.length) return er('Marque pelo menos uma atividade.');
    const btn = e.submitter || $('#fmd button[type=submit]'); btn.disabled = true;
    const r = await sb.from('fin_itens').insert(rows);
    if (r.error) { btn.disabled = false; return er(dbErr(r.error).message); }
    closeModal(); toast(`Medição ${num || n} lançada: ${rows.length} ${rows.length === 1 ? 'pagamento' : 'pagamentos'} · ${brl(rows.reduce((t, x) => t + x.valor, 0))}.`, 'ok'); celebrate();
    loadFin(pid, true);
  });
}

/* ---------- "Referente a" nos lançamentos ---------- */
function refOptions(pid, aid, sid) {
  const xs = live(allActs().filter(x => x.a.metaId === pid)).sort(SORTS.codigo), sel = VK(aid || '', sid || '');
  return `<option value="">Projeto geral (sem atividade)</option>` + xs.map(x => `<option value="${x.a.id}|" ${sel === VK(x.a.id, '') ? 'selected' : ''}>${esc(x.a.codigo || '')} · ${esc(x.a.titulo)}</option>` +
    subsOf(x.a).map((s, i) => `<option value="${x.a.id}|${s.id}" ${sel === VK(x.a.id, s.id) ? 'selected' : ''}>   └ E${i + 1} · ${esc(s.nome)}</option>`).join('')).join('');
}
const refLabel = (i) => { if (!i.atividade_id) return '<span class="muted">Projeto geral</span>'; const a = findAct(i.atividade_id); if (!a) return '<span class="muted">Atividade excluída</span>'; const k = i.etapa_id ? subsOf(a).findIndex(s => s.id === i.etapa_id) : -1; return `<span class="mono muted">${esc(a.codigo || '')}</span> ${k >= 0 ? etBadge(k + 1) + ' ' + esc(subsOf(a)[k].nome) : esc(a.titulo)}`; };

/* ---------- quadro financeiro na ficha da atividade ---------- */
function finActBox(aid) {
  const a = findAct(aid), pid = a && a.metaId;
  if (!a || !finVisible(pid)) return '';
  const D = S.finD[pid];
  if (!D || !D.loaded) { loadFin(pid); return `<legend>Financeiro</legend><div class="skel-line"></div><div class="skel-line" style="width:60%"></div>`; }
  const F = finPlan(pid), r = F && F.rows.find(z => z.x.a.id === aid);
  if (!r) return `<legend>Financeiro</legend><p class="muted" style="margin:0">Atividade cancelada: fora do cronograma financeiro.</p>`;
  const its = (D.itens || []).filter(i => i.atividade_id === aid).sort((x, y) => String(y.data).localeCompare(String(x.data)));
  return `<legend>Financeiro</legend>
    <div class="dstats sm"><div><span>Valor ${r.auto ? '(automático)' : ''}</span><b>${brl(r.valor)}</b></div><div><span>Executado · ${Math.round(r.fis)}%</span><b>${brl(r.exec)}</b></div>
      <div><span>Pago${r.fd ? ' + FD' : ''}</span><b>${brl(r.pago + r.fd)}</b></div><div><span>${r.aMedir < -0.5 ? 'Pago adiantado' : 'A medir'}</span><b class="${r.aMedir < -0.5 ? 'neg' : ''}">${brl(Math.abs(r.aMedir))}</b></div></div>
    ${r.units ? `<ul class="rp-list fa-mini">${r.units.map(u => `<li>${etBadge(u.si + 1)}<span>${esc(u.s.nome)}</span><span class="muted">${brl(u.valor)} · ${Math.round(u.fis)}%</span><span class="fv">${u.aMedir < -0.5 ? `<span class="neg">adiantado ${brl(-u.aMedir)}</span>` : u.aMedir > 0.5 ? 'a medir ' + brl(u.aMedir) : ''}</span></li>`).join('')}</ul>` : ''}
    ${its.length ? `<ul class="rp-list fa-mini">${its.map(i => `<li data-act="fin-edit" data-id="${i.id}" data-p="${pid}" tabindex="0" style="cursor:pointer"><span class="mono muted">${fds(P(i.data))}</span><span>${i.tipo === 'fd' ? 'FD · ' : ''}${esc(i.descricao)}</span><span class="fv">${i.tipo === 'fd' ? '−' : ''}${brl(i.valor)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:6px 0 0;font-size:12.5px">Nenhum pagamento ligado a esta atividade.</p>'}
    <div class="fa-acts"><button type="button" class="btn sm" data-act="fin-new-at" data-p="${pid}" data-a="${aid}">${ic('plus')}Pagamento desta atividade</button><a class="btn sm ghost" href="#financeiro--${pid}" data-act="go-fin" data-p="${pid}">Abrir financeiro</a></div>`;
}
function refreshFinBox() { const box = $('#a-fin'); if (box && S.editing && S.editing.id) box.innerHTML = finActBox(S.editing.id); }

document.addEventListener('change', e => {
  const t = e.target;
  if (t.classList && t.classList.contains('fvin')) saveValor(S.proj, t.dataset.a, t.dataset.s, t.value, t);
  else if (t.id === 'fin-auto') setAutoDist(S.proj, t.checked);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('fvin')) { e.preventDefault(); e.target.blur(); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  switch (t.dataset.act) {
    case 'fa-tog': { const id = t.dataset.id; if (S.finOpen.has(id)) S.finOpen.delete(id); else S.finOpen.add(id); render(); break; }
    case 'fv-clear': saveValor(S.proj, t.dataset.a, t.dataset.s, ''); break;
    case 'fin-med': openMedicao(S.proj); break;
    case 'fin-new-at': openFinItem(null, 'pagamento', { pid: t.dataset.p, aid: t.dataset.a }); break;
    case 'go-fin': e.preventDefault(); closeDrawer(); location.hash = 'financeiro--' + t.dataset.p; break;
  }
});
