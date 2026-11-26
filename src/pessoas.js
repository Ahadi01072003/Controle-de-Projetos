/* ===================== RESPONSÁVEIS: cadastro geral e exclusões completas ===================== */
// uso de cada pessoa em todo o sistema (o que a pessoa logada consegue ver)
function pessoaUso(id) {
  const u = { resp: 0, abertas: 0, etapas: 0, etAbertas: 0, apoio: 0, proj: new Set(), projResp: 0 };
  allActs().forEach(x => {
    const a = x.a; let hit = false;
    if (a.respId === id) { u.resp++; hit = true; if (!x.c.done && !x.c.canc) u.abertas++; }
    (a.etapas || []).forEach((e, k) => { if (e.respId === id) { u.etapas++; hit = true; const sc = x.c.subs && x.c.subs[k]; if (sc && !sc.done) u.etAbertas++; } });
    if ((a.apoioIds || []).includes(id)) { u.apoio++; hit = true; }
    if (hit) u.proj.add(a.metaId || '');
  });
  S.metas.forEach(m => { if (m.respId === id) { u.proj.add(m.id); u.projResp++; } });
  u.total = u.resp + u.etapas + u.apoio + u.projResp;
  u.logins = (S.usersList || []).filter(p => p.pessoa_id === id);
  return u;
}
const normNome = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
async function loadUsersList(force) {
  if (!S.isAdmin || typeof sb === 'undefined' || !sb) return;
  if (S.usersList && !force && Date.now() - (S.usersAt || 0) < 60000) return;
  const r = await sb.from('profiles').select('id,nome,email,pessoa_id,ativo');
  if (!r.error) { S.usersList = r.data || []; S.usersAt = Date.now(); if (S.view === 'pessoas') render(); }
}
function vCadastroPessoas() {
  if (!S.isAdmin && !anyGestor()) return `<div class="card empty"><h3>Sem acesso</h3><p>O cadastro geral de responsáveis é para gestores e administradores.</p></div>`;
  const q = normNome(S.pcQ || ''), f = S.pcF || 'todos';
  const dup = new Map(); S.pessoas.forEach(p => { const k = normNome(p.nome); dup.set(k, (dup.get(k) || 0) + 1); });
  const all = [...S.pessoas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(p => ({ p, u: pessoaUso(p.id), dup: dup.get(normNome(p.nome)) > 1 }));
  const cnt = { todos: all.length, ativos: all.filter(r => r.u.abertas || r.u.etAbertas).length, livres: all.filter(r => !r.u.total).length, dup: all.filter(r => r.dup).length };
  const rows = all.filter(r => (!q || normNome(r.p.nome + ' ' + (r.p.cargo || '')).includes(q))
    && (f === 'todos' || (f === 'ativos' && (r.u.abertas || r.u.etAbertas)) || (f === 'livres' && !r.u.total) || (f === 'dup' && r.dup)));
  const projChip = id => { const m = metaById(id); return `<span class="pc-pj"><i class="dot" style="background:${m ? metaColor(m) : 'var(--line-2)'}"></i>${esc(m ? m.nome : 'Sem projeto')}</span>`; };
  const tb = `<div class="toolbar rise pc-tb">
    <label class="field f-search">${ic('busca')}<input class="inp" id="pc-q" type="search" placeholder="Buscar por nome ou cargo" value="${esc(S.pcQ || '')}" autocomplete="off" aria-label="Buscar responsável"></label>
    <div class="seg-ctl" role="group" aria-label="Filtro">${[['todos', 'Todos'], ['ativos', 'Com atividades em aberto'], ['livres', 'Sem nenhuma atividade'], ['dup', 'Nome repetido']].map(([k, l]) => `<button data-act="pc-f" data-f="${k}" class="${f === k ? 'on' : ''}" aria-pressed="${f === k}">${l}<span class="pc-n">${cnt[k]}</span></button>`).join('')}</div>
    <span class="sp"></span>${S.isAdmin || anyGestor() ? `<button class="btn primary" data-act="new-pessoa">${ic('plus')}Novo responsável</button>` : ''}</div>`;
  const note = !S.isAdmin ? `<p class="muted pc-note">Você vê o uso de cada pessoa nos projetos que acompanha. Só administradores excluem responsáveis.</p>` : '';
  const tbl = rows.length ? `<div class="tbl-wrap rise" style="--i:1;max-height:none"><table class="tbl pctbl cardify"><thead><tr><th>Responsável</th>${S.isAdmin ? '<th>Login</th>' : ''}<th>Projetos</th><th data-tip="Em aberto / total, como responsável da atividade">Atividades</th><th data-tip="Etapas em que é o responsável (em aberto / total)">Etapas</th><th data-tip="Atividades em que está como apoio">Apoio</th><th></th></tr></thead><tbody>
    ${rows.map(({ p, u, dup }) => `<tr class="row" data-act="edit-pessoa" data-id="${p.id}" tabindex="0">
      <td><div class="pc-who">${avatar(p, 'sm')}<div><b>${esc(p.nome)}</b>${dup ? ` <span class="pc-dup" data-tip="Há outro cadastro com o mesmo nome. Use “Juntar” para unificar.">nome repetido</span>` : ''}${p.cargo ? `<div class="muted">${esc(p.cargo)}</div>` : ''}</div></div></td>
      ${S.isAdmin ? `<td data-l="Login">${u.logins.length ? u.logins.map(l => `<span class="pc-login ${l.ativo ? '' : 'off'}" data-tip="${esc(l.email)}${l.ativo ? '' : ' · desativado'}">${ic('chave')}${esc(l.email)}</span>`).join('') : '<span class="muted">—</span>'}</td>` : ''}
      <td data-l="Projetos">${u.proj.size ? [...u.proj].slice(0, 3).map(projChip).join('') + (u.proj.size > 3 ? `<span class="muted">+${u.proj.size - 3}</span>` : '') : '<span class="muted">Nenhum</span>'}</td>
      <td class="tnum" data-l="Atividades">${u.resp ? `<b>${u.abertas}</b><span class="muted"> / ${u.resp}</span>` : '<span class="muted">0</span>'}</td>
      <td class="tnum" data-l="Etapas">${u.etapas ? `<b>${u.etAbertas}</b><span class="muted"> / ${u.etapas}</span>` : '<span class="muted">0</span>'}</td>
      <td class="tnum" data-l="Apoio">${u.apoio || '<span class="muted">0</span>'}</td>
      <td class="pc-act">${S.isAdmin || anyGestor() ? `<button class="btn icon ghost sm" data-act="edit-pessoa" data-id="${p.id}" aria-label="Editar ${esc(p.nome)}" data-tip="Editar">${ic('editar')}</button><button class="btn icon ghost sm" data-act="merge-pessoa" data-id="${p.id}" aria-label="Juntar ${esc(p.nome)}" data-tip="Juntar com outro cadastro">${ic('juntar')}</button>` : ''}${S.isAdmin ? `<button class="btn icon ghost sm danger-i" data-act="pc-del" data-id="${p.id}" aria-label="Excluir ${esc(p.nome)}" data-tip="Excluir">${ic('lixo')}</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : `<div class="card empty rise" style="--i:1"><h3>${all.length ? 'Ninguém neste filtro' : 'Nenhum responsável cadastrado'}</h3><p>${all.length ? 'Mude a busca ou o filtro.' : 'Cadastre as pessoas para atribuir atividades e etapas.'}</p></div>`;
  return tb + note + tbl;
}
function afterCadastroPessoas() {
  loadUsersList();
}

/* excluir responsável: mostra o impacto e deixa escolher quem recebe as atividades */
function openDelPessoa(id) {
  const p = pessoaById(id); if (!p || !S.isAdmin) return;
  const u = pessoaUso(id), uses = [
    u.resp && `responsável por <b>${u.resp}</b> ${u.resp === 1 ? 'atividade' : 'atividades'}${u.abertas ? ` (${u.abertas} em aberto)` : ''}`,
    u.etapas && `responsável por <b>${u.etapas}</b> ${u.etapas === 1 ? 'etapa' : 'etapas'}`,
    u.apoio && `apoio em <b>${u.apoio}</b> ${u.apoio === 1 ? 'atividade' : 'atividades'}`,
    u.projResp && `responsável por <b>${u.projResp}</b> ${u.projResp === 1 ? 'projeto' : 'projetos'}`,
    u.logins.length && `ligada ao login <b>${u.logins.map(l => esc(l.email)).join(', ')}</b> (o login continua existindo, só perde o vínculo)`].filter(Boolean);
  const others = [...S.pessoas].filter(x => x.id !== id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const same = others.find(x => normNome(x.nome) === normNome(p.nome));
  openModal(`<form id="fdp" novalidate><div class="md-h"><h3>Excluir ${esc(p.nome)}</h3><p>${uses.length ? 'Esta pessoa está em uso:' : 'Esta pessoa não está em nenhuma atividade, etapa ou projeto.'}</p></div>
    <div class="md-b">${uses.length ? `<ul class="del-list">${uses.map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="f"><label for="dp-para">Passar atividades, etapas e apoio para</label><select class="sel" id="dp-para"><option value="">Ninguém (ficam sem responsável)</option>${others.map(x => `<option value="${x.id}" ${same && same.id === x.id ? 'selected' : ''}>${esc(x.nome)}${x.cargo ? ' · ' + esc(x.cargo) : ''}</option>`).join('')}</select>
      ${same ? `<span class="hint">Sugerido: há outro cadastro com o mesmo nome.</span>` : ''}</div>` : ''}
      <p class="del-safe">${ic('info')}<span>Antes de excluir, o sistema guarda uma cópia de segurança automática de tudo (em Configurações → Cópias de segurança).</span></p>
      <p class="err" id="dp-err" role="alert"></p></div>
    <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn danger" id="dp-go">${ic('lixo')}Excluir responsável</button></div></form>`);
  $('#fdp').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#dp-go'), para = $('#dp-para') ? $('#dp-para').value : '';
    b.disabled = true; b.innerHTML = 'Excluindo…';
    const r = await sb.rpc('excluir_pessoa', { p_id: id, p_para: para });
    if (r.error) { b.disabled = false; b.innerHTML = ic('lixo') + 'Excluir responsável'; $('#dp-err').textContent = r.error.message; return; }
    try { await db.reloadAll(); } catch (er) {}
    if (S.usersList) S.usersList.forEach(l => { if (l.pessoa_id === id) l.pessoa_id = null; });
    closeModal(); const d = r.data || {}, dest = para ? pessoaById(para) : null, n = (d.atividades || 0) + (d.etapas || 0);
    toast(`${p.nome} excluído(a).` + (n ? ` ${n} ${n === 1 ? 'item passou' : 'itens passaram'} para ${dest ? dest.nome : 'sem responsável'}.` : ''), 'ok');
  });
}

/* excluir projeto: apaga junto atividades, etapas, reuniões, financeiro e acessos (com confirmação pelo nome) */
function openDelMeta(id) {
  const m = metaById(id); if (!m || !S.isAdmin) return;
  const as = S.atividades.filter(a => a.metaId === id), ne = as.reduce((s, a) => s + (a.etapas || []).length, 0);
  const nr = (S.reunioes || []).filter(r => (r.projetoId || '') === id).length;
  const items = [`<b>${as.length}</b> ${as.length === 1 ? 'atividade' : 'atividades'}`, ne && `<b>${ne}</b> ${ne === 1 ? 'etapa' : 'etapas'} dentro delas`, nr && `<b>${nr}</b> ${nr === 1 ? 'reunião fechada' : 'reuniões fechadas'}`, m.financeiro && 'o financeiro (contrato, pagamentos, valores por atividade)', 'o histórico e os acessos dos usuários a este projeto'].filter(Boolean);
  openModal(`<form id="fdm" novalidate><div class="md-h"><h3>Excluir o projeto ${esc(m.nome)}</h3><p>Isto apaga o projeto e tudo o que está dentro dele:</p></div>
    <div class="md-b"><ul class="del-list">${items.map(t => `<li>${t}</li>`).join('')}</ul>
      <p class="del-safe">${ic('info')}<span>Antes de excluir, o sistema guarda uma cópia de segurança automática de tudo (em Configurações → Cópias de segurança).</span></p>
      <div class="f"><label for="dm-nome">Para confirmar, digite o nome do projeto</label><input class="inp" id="dm-nome" autocomplete="off" placeholder="${esc(m.nome)}"></div>
      <p class="err" id="dm-err" role="alert"></p></div>
    <div class="md-f"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn danger" id="dm-go" disabled>${ic('lixo')}Excluir projeto e tudo dentro</button></div></form>`);
  const inp = $('#dm-nome'), go = $('#dm-go'), ok = () => normNome(inp.value) === normNome(m.nome);
  inp.addEventListener('input', () => { go.disabled = !ok(); });
  setTimeout(() => inp.focus(), 60);
  $('#fdm').addEventListener('submit', async e => {
    e.preventDefault(); if (!ok()) return;
    go.disabled = true; go.innerHTML = 'Excluindo…';
    const r = await sb.rpc('excluir_projeto', { p_id: id });
    if (r.error) { go.disabled = false; go.innerHTML = ic('lixo') + 'Excluir projeto e tudo dentro'; $('#dm-err').textContent = r.error.message; return; }
    try { await db.reloadAll(); } catch (er) {}
    closeModal(); const d = r.data || {};
    if (S.proj === id) location.hash = '#projetos';
    toast(`Projeto ${m.nome} excluído, com ${d.atividades ?? as.length} atividades e ${d.etapas ?? ne} etapas.`, 'ok');
  });
}
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'pc-f') { S.pcF = t.dataset.f; render(); }
  if (t.dataset.act === 'pc-del') { e.stopPropagation(); openDelPessoa(t.dataset.id); }
});
document.addEventListener('input', e => { if (e.target.id === 'pc-q') { S.pcQ = e.target.value; clearTimeout(S.pcT); S.pcT = setTimeout(render, 140); } });
