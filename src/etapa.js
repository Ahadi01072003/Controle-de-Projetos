/* ===================== DATAS REAIS, CORREÇÕES DE CADASTRO E FICHA DA ETAPA ===================== */

/* ---------- Iniciar / Concluir: pergunta a data (padrão hoje), em vez de gravar hoje sem avisar ---------- */
function askWhen(kind, aid, sid) {
  const a = findAct(aid); if (!a) return Promise.resolve(null);
  const s = sid ? subsOf(a).find(x => x.id === sid) : null, k = s ? subsOf(a).indexOf(s) : -1, o = s || a, T = ISO(today());
  const min = kind === 'fim' ? (o.iniReal || '') : '', max = kind === 'ini' && o.fimReal ? o.fimReal : T;
  const plan = kind === 'ini' ? o.iniPlan : o.fimPlan;
  return new Promise(res => {
    openModal(`<form id="fw" novalidate><div class="md-h"><h3>${kind === 'ini' ? 'Iniciar' : 'Concluir'} ${s ? 'etapa' : 'atividade'}</h3><p>${esc(a.codigo || '')}${s ? ' · E' + (k + 1) + ' · ' + esc(s.nome) : ' · ' + esc(a.titulo)}</p></div>
      <div class="md-b"><div class="f"><label for="fw-d">${kind === 'ini' ? 'Data em que começou' : 'Data em que terminou'}</label>
        <div class="withbtn"><input class="inp" type="date" id="fw-d" value="${T}" max="${max}" ${min ? `min="${min}"` : ''}><button type="button" class="btn sm" id="fw-hoje">Hoje</button></div>
        <span class="hint">Planejado: ${kind === 'ini' ? 'início' : 'fim'} em ${fd(P(plan))}.${kind === 'fim' && o.iniReal ? ` Começou em ${fd(P(o.iniReal))}.` : ''} Se foi em outro dia, escolha a data real.</span></div>
        <p class="err" id="fw-err" role="alert"></p></div>
      <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">${ic(kind === 'ini' ? 'play' : 'check', kind === 'ini' ? 'fill' : '')}${kind === 'ini' ? 'Iniciar' : 'Concluir'}</button></div></form>`);
    S.modalCancel = () => res(null);
    $('#fw-hoje').onclick = () => { $('#fw-d').value = T; };
    setTimeout(() => { const b = $('#fw button[type=submit]'); if (b) b.focus(); }, 80);
    $('#fw').addEventListener('submit', e => {
      e.preventDefault(); const d = $('#fw-d').value, er = m => { $('#fw-err').textContent = m; };
      if (P(d) == null) return er('Escolha a data.');
      if (d > T) return er('A data real não pode estar no futuro.');
      if (min && d < min) return er(`O fim não pode ser antes do início real (${fd(P(min))}).`);
      if (kind === 'ini' && o.fimReal && d > o.fimReal) return er(`O início não pode ser depois do fim real (${fd(P(o.fimReal))}).`);
      S.modalCancel = null; closeModal(); res(d);
    });
  });
}

/* ---------- correções de cadastro: não contam como replanejamento ---------- */
function corrList(cs) {
  if (!cs || !cs.length) return '';
  return `<div class="corr"><div class="eyebrow" style="margin:12px 0 6px">Correções de cadastro <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· não contam como replanejamento</span></div><ul class="corr-l">${cs.slice().reverse().map(c => {
    const dt = new Date(c.em), ch = [];
    if (c.iniDe !== c.iniPara) ch.push(`Início ${fds(P(c.iniDe))} → ${fds(P(c.iniPara))}`);
    if (c.fimDe !== c.fimPara) ch.push(`Fim ${fds(P(c.fimDe))} → ${fds(P(c.fimPara))}`);
    return `<li>${ic('editar')}<div><b>${ch.join(' · ') || 'Datas corrigidas'}</b><span class="muted">${isNaN(dt) ? '' : dt.toLocaleDateString('pt-BR')}${c.por && personName(c.por) ? ' · ' + esc(personName(c.por)) : ''}${c.reclass ? ' · reclassificado de replanejamento' : ''}</span>${c.comentario ? `<span>${esc(c.comentario)}</span>` : ''}</div></li>`;
  }).join('')}</ul></div>`;
}
// transforma o replanejamento i em correção (o primeiro também corrige o plano original)
function reclassify(o, i) {
  const reps = (o.replans || []).slice(), [r] = reps.splice(i, 1); if (!r) return null;
  const out = { replans: reps, correcoes: [...(o.correcoes || []), { ...r, reclass: nowISO(), reclassPor: S.userId }] };
  if (i === 0) { out.iniOrig = r.iniPara; out.fimOrig = r.fimPara; }
  return out;
}
async function reclassAct(aid, i, btn) {
  const a = findAct(aid); if (!a || !canManage(a.metaId)) return;
  if (!armed(btn, i === 0 ? 'Confirmar: vira correção e o plano original passa a ser a data corrigida' : 'Confirmar: vira correção (o plano original continua o mesmo)')) return;
  const p = reclassify(a, +i); if (!p) return;
  if (await write(() => db.doc('atividades/' + aid).update({ ...p, atualizadoEm: nowISO() }))) {
    logEvt('edicao', a, `Replanejamento ${+i + 1} reclassificado como correção de cadastro`);
    toast('Reclassificado como correção. Não conta mais como replanejamento.', 'ok');
    setTimeout(() => { if (S.editing && S.editing.id === aid && !S.editing.sid) openAct(aid); }, 150);
  }
}
async function reclassSub(aid, sid, i, btn) {
  const a = findAct(aid); if (!a || !canManage(a.metaId)) return;
  if (!armed(btn, +i === 0 ? 'Confirmar: vira correção e o plano original passa a ser a data corrigida' : 'Confirmar: vira correção')) return;
  const subs = JSON.parse(JSON.stringify(subsOf(a))), k = subs.findIndex(s => s.id === sid); if (k < 0) return;
  const p = reclassify(subs[k], +i); if (!p) return;
  subs[k] = { ...subs[k], ...p };
  if (await saveSubs(a, subs, `E${k + 1} · ${subs[k].nome}: replanejamento ${+i + 1} reclassificado como correção de cadastro`)) { toast('Reclassificado como correção.', 'ok'); setTimeout(() => openEtapa(aid, sid), 150); }
}

/* ---------- ficha completa da etapa ---------- */
function openEtapa(aid, sid) {
  const a = findAct(aid); if (!a) return;
  const subs = subsOf(a), k = subs.findIndex(s => s.id === sid); if (k < 0) { openAct(aid); return; }
  const s = subs[k], x = allActs().find(y => y.a.id === aid), c = x && x.c.subs ? x.c.subs[k] : null; if (!c) { openAct(aid); return; }
  const pv = CAL; CAL = calFor(a.metaId);
  const T = today(), mode = canManage(a.metaId) ? 'full' : canLog(a, s) ? 'exec' : 'ro', dis = mode === 'full' ? '' : 'disabled', disx = mode === 'ro' ? 'disabled' : '';
  const daily = calFor(a.metaId).daily && !a.diarioOff, resp = pessoaById(s.respId) || x.p;
  S.editing = { id: aid, sid, orig: a, etapa: true };
  const vb = (l, v, cls = '') => `<div class="vbox"><span>${l}</span><b class="${cls}">${v}</b></div>`, cl = n => n > 0 ? 'up' : n < 0 ? 'dn' : '';
  const durO = dur(c.io, c.fo), durP = dur(c.ip, c.fp), dDur = (durP ?? 0) - (durO ?? 0);
  const ind = `<div class="vgrid">${vb('Variação do início', fdelta(c.dIni), cl(c.dIni))}${vb('Variação do fim', fdelta(c.dFim), cl(c.dFim))}${vb('Variação da duração', fdelta(dDur), cl(dDur))}
    ${c.done ? vb('Fim real vs. plano atual', fdelta(dd(c.fp, c.fr)), cl(dd(c.fp, c.fr))) : vb(c.rest < 0 ? 'Atraso vs. plano atual' : 'Prazo do plano atual', c.rest < 0 ? fdelta(-c.rest) : c.rest === 0 ? 'vence hoje' : 'faltam ' + c.rest + ' ' + U(), c.rest < 0 ? 'up' : '')}</div>`;
  const reps = s.replans || [];
  const hist = reps.length || (s.correcoes || []).length ? `<div><div class="eyebrow" style="margin-bottom:6px">Histórico de replanejamentos da etapa</div>${reps.length ? `<ul class="tl">${reps.map((r, i) => {
    const dt = new Date(r.em), ch = [];
    if (r.iniDe !== r.iniPara) ch.push(`Início ${fds(P(r.iniDe))} → ${fds(P(r.iniPara))} ${dlt(dd(P(r.iniDe), P(r.iniPara)))}`);
    if (r.fimDe !== r.fimPara) ch.push(`Fim ${fds(P(r.fimDe))} → ${fds(P(r.fimPara))} ${dlt(dd(P(r.fimDe), P(r.fimPara)))}`);
    return `<li><div class="mk">${revSvg(i + 1)}</div><div><div class="hd"><b>Revisão ${i + 1}</b><span class="when">${isNaN(dt) ? '' : dt.toLocaleDateString('pt-BR')}${r.por && personName(r.por) ? ' · ' + esc(personName(r.por)) : ''}</span></div><div class="ch">${ch.join('<span>·</span>')}</div><div class="why"><span class="mot">${esc(MOTIVOS[r.motivo] || 'Outro')}</span>${esc(r.comentario || '')}</div>${mode === 'full' ? `<button type="button" class="lnk rp-fix" data-act="rp-fix-s" data-id="${aid}" data-sid="${sid}" data-i="${i}">Foi erro de cadastro? Reclassificar como correção</button>` : ''}</div></li>`;
  }).reverse().join('')}</ul>` : ''}${corrList(s.correcoes)}</div>` : '';
  const fin = typeof finVisible === 'function' && finVisible(a.metaId) ? (() => {
    const F = finPlan(a.metaId), r = F && F.rows.find(z => z.x.a.id === aid), u = r && r.units ? r.units.find(z => z.s.id === sid) : null;
    if (!F) { loadFin(a.metaId); return `<fieldset class="box fin-box"><legend>Financeiro</legend><div class="skel-line"></div></fieldset>`; }
    return u ? `<fieldset class="box fin-box"><legend>Financeiro da etapa</legend><div class="dstats sm"><div><span>Valor ${u.manual ? '' : '(automático)'}</span><b>${brl(u.valor)}</b></div><div><span>Executado · ${Math.round(u.fis)}%</span><b>${brl(u.exec)}</b></div><div><span>Pago${u.fd ? ' + FD' : ''}</span><b>${brl(u.pago + u.fd)}</b></div><div><span>${u.aMedir < -0.5 ? 'Pago adiantado' : 'A medir'}</span><b class="${u.aMedir < -0.5 ? 'neg' : ''}">${brl(Math.abs(u.aMedir))}</b></div></div></fieldset>` : '';
  })() : '';
  const html = `<form id="fet" novalidate style="display:contents">
    <div class="dr-h"><div class="r1"><span class="mono muted">${esc(a.codigo || '')}</span>${etBadge(k + 1)}${revMark(c.nRep)}<span class="sp"></span><button type="button" class="btn icon ghost" data-act="close-drawer" aria-label="Fechar">${ic('fechar')}</button></div>
      <h2 id="drTitle" tabindex="-1">${esc(s.nome)}</h2>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${chip(c.status, 'lg')}${earlyTag(c, true)}${c.replan && c.statusOrig !== c.status ? `<span class="muted" style="font-size:12.5px">Pela data original: <b style="color:var(--ink)">${ST[c.statusOrig].l}</b></span>` : ''}</div>
      <div class="planline"><span>${ic('cal')}Plano <b class="mono">${fds(c.ip)} → ${fds(c.fp)}</b></span><span class="muted">${!c.dIni && !c.dFim ? 'igual ao original' : `original ${fds(c.io)} → ${fds(c.fo)} ${dlt(c.dFim, false)}`}</span>${c.done ? `<span>Concluída ${fds(c.fr)}</span>` : `<span class="${c.rest < 0 ? 'neg' : ''}">${c.rest < 0 ? fdelta(-c.rest) + ' de atraso' : c.rest === 0 ? 'vence hoje' : 'faltam ' + c.rest + ' ' + U()}</span>`}</div>
      <button type="button" class="et-parent" data-act="open-act" data-id="${aid}">${ic('seta', 'flip')}<span>Etapa de <b>${esc(a.titulo)}</b> · ${fds(P(a.iniPlan))} → ${fds(P(a.fimPlan))}</span></button></div>
    <div class="dr-b">
      <fieldset class="box"><legend>Planejamento</legend>
        <div class="fgrid"><div class="f"><label for="et-ini">Início planejado</label><input class="inp" type="date" id="et-ini" value="${esc(s.iniPlan)}" min="${esc(a.iniPlan)}" max="${esc(a.fimPlan)}" ${dis}></div>
        <div class="f"><label for="et-fim">Fim planejado</label><input class="inp" type="date" id="et-fim" value="${esc(s.fimPlan)}" min="${esc(a.iniPlan)}" max="${esc(a.fimPlan)}" ${dis}></div></div>
      </fieldset>
      <fieldset class="box"><legend>Execução</legend>
        <div class="fgrid"><div class="f"><label for="et-inir">Início real</label><div class="withbtn"><input class="inp" type="date" id="et-inir" value="${esc(s.iniReal || '')}" max="${ISO(T)}" ${disx}>${mode !== 'ro' ? `<button type="button" class="btn sm" data-act="set-today" data-for="et-inir">Hoje</button>` : ''}</div></div>
        <div class="f"><label for="et-fimr">Fim real</label><div class="withbtn"><input class="inp" type="date" id="et-fimr" value="${esc(s.fimReal || '')}" max="${ISO(T)}" ${disx}>${mode !== 'ro' ? `<button type="button" class="btn sm" data-act="set-today" data-for="et-fimr">Hoje</button>` : ''}</div></div></div>
        ${daily ? `<div class="planhint">${ic('cal')}<span>O avanço vem do <b>registro diário</b> (${Math.round(c.prog)}%).</span></div>`
          : `<div class="f"><label for="et-prog">Avanço da etapa (%)</label><div class="range"><input type="range" id="et-prog" min="0" max="100" step="5" value="${s.progresso != null ? s.progresso : 0}" ${disx}><output id="et-progout">${s.progresso != null ? s.progresso : 0}%</output></div></div>`}
      </fieldset>
      <details class="more-d" id="et-more" ${S.moreOpen ? 'open' : ''}><summary><span>Mais detalhes</span><span class="muted">${[`responsável ${esc(resp ? resp.nome : '—')}`, `peso ${+s.peso || 1}`, reps.length ? `${reps.length} ${reps.length === 1 ? 'replanejamento' : 'replanejamentos'}` : '', fin ? 'financeiro' : '', daily ? 'diário' : ''].filter(Boolean).join(' · ')}</span></summary><div class="more-b">
        ${ind}
        <div class="fgrid">
          <div class="f full"><label for="et-nome">Nome da etapa</label><input class="inp" id="et-nome" value="${esc(s.nome)}" maxlength="120" ${dis}></div>
          <div class="f"><label for="et-resp">Responsável</label><select class="sel" id="et-resp" ${dis}><option value="">Mesmo da atividade (${esc(x.p ? x.p.nome : 'sem responsável')})</option>${pessoaOptions(s.respId || '', false)}</select></div>
          <div class="f"><label for="et-peso">Peso na atividade</label><select class="sel" id="et-peso" ${dis}>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(+s.peso || 1) === n ? 'selected' : ''}>${n}${n === 1 ? ' (padrão)' : ''}</option>`).join('')}</select></div>
        </div>
        ${daily && c.di ? `<fieldset class="box"><legend>Avanço diário</legend><div class="dcal" id="e-daily">${dailyCells(a, s, c)}</div><span class="hint">${canLog(a, s) ? 'Clique num dia para alternar: Feito → Parcial 50% → Não feito → sem registro.' : ''}</span></fieldset>` : ''}
        ${fin}${hist}
        <p class="muted" style="font-size:12px;margin:0">Cadastrada em ${s.criadoEm ? new Date(s.criadoEm).toLocaleDateString('pt-BR') : '—'} · plano original ${fds(c.io)} → ${fds(c.fo)}</p>
      </div></details>
      <p class="err" id="et-err" role="alert"></p>
    </div>
    <div class="dr-f">${mode === 'full' ? `<button type="button" class="btn danger sm" data-act="sub-del" data-id="${aid}" data-sid="${sid}">${ic('lixo')}Excluir etapa</button>` : ''}<span class="sp"></span>
      <button type="button" class="btn ghost" data-act="close-drawer">${mode === 'ro' ? 'Fechar' : 'Cancelar'}</button>${mode === 'ro' ? '' : `<button type="submit" class="btn primary">${ic('check')}Salvar etapa</button>`}</div></form>`;
  CAL = pv;
  openDrawer(html, false);
  S.editing = { id: aid, sid, orig: a, etapa: true };
  const md = $('#et-more'); if (md) md.addEventListener('toggle', () => { S.moreOpen = md.open; });
  const pr = $('#et-prog'); if (pr) pr.addEventListener('input', () => { $('#et-progout').textContent = pr.value + '%'; });
  $('#fet').addEventListener('submit', e => { e.preventDefault(); saveEtapa(aid, sid, mode); });
}
async function saveEtapa(aid, sid, mode) {
  const cur = findAct(aid); if (!cur) return;
  const list = JSON.parse(JSON.stringify(subsOf(cur))), k = list.findIndex(z => z.id === sid); if (k < 0) return;
  const old = list[k], T = today(), err = m => { $('#et-err').textContent = m; if (/nome|responsável/i.test(m)) { const d = $('#et-more'); if (d) d.open = true; } return false; };
  const ev = { iniReal: $('#et-inir').value || '', fimReal: $('#et-fimr').value || '' };
  if ($('#et-prog')) ev.progresso = +$('#et-prog').value;
  const ir = P(ev.iniReal), fr = P(ev.fimReal);
  if (fr != null && ir == null) return err('Informe o início real antes do fim real.');
  if (ir != null && fr != null && fr < ir) return err('O fim real não pode ser antes do início real.');
  if ((ir != null && ir > T) || (fr != null && fr > T)) return err('Datas reais não podem estar no futuro.');
  if (fr != null && ev.progresso != null) ev.progresso = 100;
  let msg = `E${k + 1} · ${old.nome} atualizada`, corr = false;
  if (mode === 'full') {
    const v = { nome: $('#et-nome').value.trim(), respId: $('#et-resp').value, peso: +$('#et-peso').value || 1, iniPlan: $('#et-ini').value, fimPlan: $('#et-fim').value };
    const ip = P(v.iniPlan), fp = P(v.fimPlan), ai = P(cur.iniPlan), af = P(cur.fimPlan);
    if (!v.nome) return err('Dê um nome para a etapa.');
    if (ip == null || fp == null) return err('Informe o início e o fim planejados.');
    if (fp < ip) return err('O fim planejado não pode ser antes do início.');
    if (ip < ai || fp > af) return err(`A etapa precisa caber dentro da atividade (${fds(ai)} → ${fds(af)}). Para ir além, replaneje primeiro a atividade.`);
    let replans = old.replans || [];
    if (v.iniPlan !== old.iniPlan || v.fimPlan !== old.fimPlan) {
      const r = await askReplan({ codigo: `${cur.codigo} · E${k + 1}`, titulo: old.nome, iniOrig: old.iniOrig || old.iniPlan, fimOrig: old.fimOrig || old.fimPlan, iniPlan: old.iniPlan, fimPlan: old.fimPlan, replans }, v.iniPlan, v.fimPlan);
      if (!r) return;
      const mud = { em: nowISO(), por: S.userId, iniDe: old.iniPlan, iniPara: v.iniPlan, fimDe: old.fimPlan, fimPara: v.fimPlan, comentario: r.comentario };
      if (r.tipo === 'correcao') { corr = true; old.correcoes = [...(old.correcoes || []), mud]; if (!replans.length) { old.iniOrig = v.iniPlan; old.fimOrig = v.fimPlan; } msg = `E${k + 1} · ${v.nome}: datas corrigidas (erro de cadastro) ${fds(P(old.iniPlan))}→${fds(ip)}, ${fds(P(old.fimPlan))}→${fds(fp)}`; }
      else { replans = [...replans, { ...mud, motivo: r.motivo }]; msg = `E${k + 1} · ${v.nome} replanejada: ${fds(P(old.iniPlan))}→${fds(ip)}, ${fds(P(old.fimPlan))}→${fds(fp)}`; }
    }
    list[k] = { ...old, ...v, ...ev, iniOrig: old.iniOrig || old.iniPlan, fimOrig: old.fimOrig || old.fimPlan, replans, ...(v.respId && v.respId !== (old.respId || '') ? { atribuidoEm: nowISO(), atribuidoPor: S.userId } : {}) };
  } else list[k] = { ...old, ...ev };
  const doc = await saveSubs(cur, list, msg);
  if (doc) { closeDrawer(); toast(corr ? 'Datas corrigidas. Não conta como replanejamento.' : 'Etapa salva.', 'ok'); if (fr != null && !old.fimReal && fr <= P(list[k].fimPlan)) celebrate(); }
}
// mantém o diário da ficha da etapa em dia quando um dia é marcado
function etapaRefresh() {
  const ed = S.editing; if (!ed || !ed.etapa) return;
  const box = $('#e-daily');
  const a = findAct(ed.id), x = a && allActs().find(y => y.a.id === ed.id), k = a ? subsOf(a).findIndex(s => s.id === ed.sid) : -1;
  if (!a || k < 0) { closeDrawer(); return; }
  if (!x || !x.c.subs) return;
  if (!box) return;
  const pv = CAL; CAL = calFor(a.metaId); box.innerHTML = dailyCells(a, subsOf(a)[k], x.c.subs[k]); CAL = pv;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'rp-fix') { e.stopPropagation(); reclassAct(t.dataset.id, t.dataset.i, t); }
  else if (t.dataset.act === 'rp-fix-s') { e.stopPropagation(); reclassSub(t.dataset.id, t.dataset.sid, t.dataset.i, t); }
});
