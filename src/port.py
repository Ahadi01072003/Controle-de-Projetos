import sys, os
SRC, OUT, D, URL, KEY = sys.argv[1:6]
s = open(SRC, encoding='utf-8').read()
part = lambda n: open(os.path.join(D, n), encoding='utf-8').read()
def R(a, b, cnt=1):
    global s
    n = s.count(a)
    assert n == cnt, (n, a[:150])
    s = s.replace(a, b)
def cut(a, b):
    global s
    i = s.index(a); j = s.index(b, i); s = s[:i] + s[j:]

# ---------- 1. fontes: sem plataforma de artefatos ----------
R("let db = null, userCap = null, downloads = null;",
  """let db = null;
const downloads = { async save({ filename, data }) { const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return { status: 'saved' }; } };""")
R("s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';", "s.src = 'vendor/exceljs.min.js';")

# ---------- 2. estado e permissões ----------
R("open: new Set(), reunioes: [], rep: null,", "open: new Set(), reunioes: [], rep: null, lv: {}, me: null, isAdmin: false, started: false,")
cut("async function write(fn, quiet = false) {", "/* ===================== UI: eventos, tooltip, toast, confete ===================== */")
s = s.replace("/* ===================== UI: eventos, tooltip, toast, confete ===================== */", part('web_core.js').replace('__SUPA_URL__', URL).replace('__SUPA_KEY__', KEY) + "\n/* ===================== UI: eventos, tooltip, toast, confete ===================== */", 1)
R("S.canWrite", "S.canWrite", s.count("S.canWrite"))  # no-op guard (mantém contagem)
R("boot();\n</script>", "authInit();\n</script>")

# ---------- 3. render: permissões, botões, rodapé ----------
R("  const v = S.view, V = VIEWS[v];\n  renderNav();", "  const v = S.view, V = VIEWS[v];\n  syncPerm();\n  renderNav(); renderMe();")
R("$('#btnConfig').hidden = !ready || !S.canWrite;", "$('#btnConfig').hidden = !ready || !S.isAdmin;")
R("$('#roChip').hidden = !ready || S.canWrite;", "$('#roChip').hidden = !ready || S.canWrite || !S.proj;\n  $('#roChip').lastChild.textContent = S.proj && lvl(S.proj) === 'responsavel' ? 'Você lança nas suas atividades' : 'Somente visualização';")
R("""      <div id="todayLbl"></div>""", """      <div id="meBox"></div>
      <div id="todayLbl"></div>""")
R("""<div class="toasts" id="toasts" aria-live="polite"></div>""", """<div class="toasts" id="toasts" aria-live="polite"></div>
<div class="authwrap" id="auth" hidden></div>""")
R("<div>Atalhos: <span class=\"kbd\">N</span> nova atividade · <span class=\"kbd\">/</span> buscar</div>", "<div>Atalhos: <span class=\"kbd\">N</span> nova atividade · <span class=\"kbd\">/</span> buscar</div>")

# ---------- 4. navegação e telas ----------
R("""  projetos:        { t: 'Projetos', i: 'alvo', home: 1,""", """  usuarios:        { t: 'Usuários e acessos', i: 'pessoas', home: 1, sub: () => 'Quem entra no sistema e o que cada pessoa pode ver e controlar em cada projeto', r: vUsuarios, after: afterUsuarios },
  projetos:        { t: 'Projetos', i: 'alvo', home: 1,""")
R("""  const homeExtra = navA('reuniao', projHash('reuniao'));""", """  const homeExtra = navA('reuniao', projHash('reuniao')) + (S.isAdmin ? navA('usuarios', 'usuarios') : '');""")
R("""  if (i < 0) return VIEWS[h] && VIEWS[h].home ? { view: h, proj: null } : { view: 'projetos', proj: null };""",
  """  if (i < 0) return VIEWS[h] && VIEWS[h].home && (h !== 'usuarios' || S.isAdmin) ? { view: h, proj: null } : { view: 'projetos', proj: null };""")
R("""function meetBanner() {
  if (S.state !== 'ready' || !S.canWrite ||""", """function meetBanner() {
  if (S.state !== 'ready' || !anyGestor() ||""")
R("""${S.canWrite ? (closedToday ?""", """${anyGestor() ? (closedToday ?""")
cut("async function closeMeeting() {\n  if (!S.canWrite) return;", "function openPresent(i = 0) {")
R("""<h3>Nenhum projeto ainda</h3><p>Crie um projeto ou importe sua planilha. Uma coluna “Projeto” ou “Meta” separa as atividades automaticamente.</p>""",
  """<h3>${S.isAdmin ? 'Nenhum projeto ainda' : 'Nenhum projeto liberado para você'}</h3><p>${S.isAdmin ? 'Crie um projeto ou importe sua planilha. Uma coluna “Projeto” ou “Meta” separa as atividades automaticamente.' : 'Peça ao administrador para liberar o seu acesso aos projetos.'}</p>""")
R("""function metaOptions(sel, withAll = true) {
  const ms = [...S.metas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));""", """function metaOptions(sel, withAll = true) {
  const ms = [...S.metas].filter(m => withAll || canManage(m.id) || m.id === sel).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));""")

# ---------- 5. permissões finas por atividade / etapa ----------
R("""    if (x.c.subs) return nextSubQA(x);
    if (!S.canWrite) return '';""", """    if (x.c.subs) return nextSubQA(x);
    if (!canLog(x.a, null)) return '';""")
R("""if (x.a.manual === 'pausada') return `<button class="btn sm" data-act="resume\"""", """if (x.a.manual === 'pausada') return !canManage(x.a.metaId) ? '' : `<button class="btn sm" data-act="resume\"""")
R("""async function quickStart(id) {
  const a = S.atividades.find(x => x.id === id); if (!a) return;""", """async function quickStart(id) {
  const a = S.atividades.find(x => x.id === id); if (!a || !canLog(a, null)) return;""")
R("""async function quickFinish(id, el) {
  const a = S.atividades.find(x => x.id === id); if (!a) return;""", """async function quickFinish(id, el) {
  const a = S.atividades.find(x => x.id === id); if (!a || !canLog(a, null)) return;""")
R("""  if (!db || !S.canWrite) return;
  const doc = { em: nowISO()""", """  if (!db || !S.userId) return;
  const doc = { em: nowISO()""")
R("""  if (!S.canWrite || c.done || x.c.canc) return '';""", """  if (!canLog(x.a, s) || c.done || x.c.canc) return '';""")
R("""  if (!S.canWrite || x.c.canc) return '';""", """  if (!canLog(x.a, s) || x.c.canc) return '';""")
R("""sc = c.subs || [], ro = !S.canWrite;""", """sc = c.subs || [], ro = !canManage(a.metaId);""")
R("""${fut || !S.canWrite ? 'disabled' : ''}""", """${fut || !canLog(a, s) ? 'disabled' : ''}""")
R("""<span class="hint">${S.canWrite ? 'Clique num dia para alternar""", """<span class="hint">${canLog(a, null) ? 'Clique num dia para alternar""")
R("""  const a = findAct(id); if (!a || !S.canWrite) return null;
  if (P(k) > today())""", """  const a = findAct(id); if (!a || !canLog(a, sid ? subsOf(a).find(s => s.id === sid) : null)) { if (a) toast('Você só lança nas suas atividades e etapas.', 'warn'); return null; }
  if (P(k) > today())""")
R("""  if (!items.length || !S.canWrite) return;
  const t = toast(`Registrando""", """  if (!items.length) return;
  const t = toast(`Registrando""")
R("""its.forEach(({ k, v, sid }) => { if (P(k) <= today() && applyDayToDoc(doc, sid, k, v)) n++; });""", """its.forEach(({ k, v, sid }) => { if (P(k) <= today() && canLog(a, sid ? subsOf(a).find(s => s.id === sid) : null) && applyDayToDoc(doc, sid, k, v)) n++; });""")
R("""  if (!S.canWrite || t.disabled) return;
  const id = t.dataset.id, sid""", """  if (t.disabled) return;
  const id = t.dataset.id, sid""")
R("""async function subSetDates(aid, sid, field, iso) {
  const a = findAct(aid); if (!a) return;""", """async function subSetDates(aid, sid, field, iso) {
  const a = findAct(aid); if (!a) return;
  if (!canLog(a, subsOf(a).find(s => s.id === sid))) { toast('Você só lança nas suas atividades e etapas.', 'warn'); return; }""")
R("""const pd = projDay(L, D), ro = !S.canWrite;""", """const pd = projDay(L, D), ro = !(S.canWrite || lvl(S.proj) === 'responsavel');""")
R("""dis = ro ? 'disabled' : '', selOn = S.dsel.has(it.key);""", """dis = canLog(x.a, s) ? '' : 'disabled', selOn = S.dsel.has(it.key);""")
R("""<div class="dl-top">${ro ? '' : `<input type="checkbox" class="dsel\"""", """<div class="dl-top">${!canLog(x.a, s) ? '' : `<input type="checkbox" class="dsel\"""")
R("""S.dsel = new Set($$('.drow').filter(r => act === 'dsel-all' ||""", """S.dsel = new Set($$('.drow').filter(r => r.querySelector('.dsel') && (act === 'dsel-all' ||""")
R("""!r.classList.contains('has-nao')).map(r => r.dataset.key)); render(); break; }""", """!r.classList.contains('has-nao'))).map(r => r.dataset.key)); render(); break; }""")
R("""<td>${r.p && S.canWrite ? `<button class="btn icon ghost sm" data-act="edit-pessoa\"""", """<td>${r.p && S.isAdmin ? `<button class="btn icon ghost sm" data-act="edit-pessoa\"""")
R("""${m ? `<button type="button" class="btn danger sm" data-act="del-meta\"""", """${m && S.isAdmin ? `<button type="button" class="btn danger sm" data-act="del-meta\"""")
R("""${p ? `<button type="button" class="btn danger sm" data-act="del-pessoa\"""", """${p && S.isAdmin ? `<button type="button" class="btn danger sm" data-act="del-pessoa\"""")

# ---------- 6. ficha da atividade: modos completo / só execução / leitura ----------
R("""const c = a ? calc(a, T) : null, ro = !S.canWrite;
  const d = a ?""", """const c = a ? calc(a, T) : null, mode = !a ? (S.canWrite ? 'full' : 'ro') : canManage(a.metaId) ? 'full' : canLog(a, null) ? 'exec' : 'ro', ro = mode === 'ro';
  const d = a ?""")
R("""  const dis = ro ? 'disabled' : '';
  const vb =""", """  const dis = mode === 'full' ? '' : 'disabled', disx = ro ? 'disabled' : '';
  const vb =""")
R("""id="a-inir" value="${esc(d.iniReal || '')}" max="${ISO(T)}" ${dis}>${ro ?""", """id="a-inir" value="${esc(d.iniReal || '')}" max="${ISO(T)}" ${disx}>${ro ?""")
R("""id="a-fimr" value="${esc(d.fimReal || '')}" max="${ISO(T)}" ${dis}>${ro ?""", """id="a-fimr" value="${esc(d.fimReal || '')}" max="${ISO(T)}" ${disx}>${ro ?""")
R("""id="a-progon" ${d.progresso != null ? 'checked' : ''} ${dis}>""", """id="a-progon" ${d.progresso != null ? 'checked' : ''} ${disx}>""")
R("""value="${d.progresso ?? 0}" ${dis}><output id="a-progout">""", """value="${d.progresso ?? 0}" ${disx}><output id="a-progout">""")
R("""${ro ? '' : '<option value="__new">＋ Cadastrar novo projeto…</option>'}""", """${mode === 'full' && S.isAdmin ? '<option value="__new">＋ Cadastrar novo projeto…</option>' : ''}""")
R("""${ro ? '' : '<option value="__new">＋ Cadastrar nova pessoa…</option>'}""", """${mode === 'full' ? '<option value="__new">＋ Cadastrar nova pessoa…</option>' : ''}""")
R("""<div class="dr-f">${a && !ro ? `<button type="button" class="btn danger sm" data-act="del-act\"""", """<div class="dr-f">${a && mode === 'full' ? `<button type="button" class="btn danger sm" data-act="del-act\"""")
R("""  const a = ed.orig, T = today(), err = $('#a-err');
  const v = {""", """  const a = ed.orig, T = today(), err = $('#a-err');
  if (a && !canManage(a.metaId)) {
    // responsável: só grava a execução (o banco também confere)
    const ev = { iniReal: $('#a-inir').value || '', fimReal: $('#a-fimr').value || '', progresso: $('#a-progon').checked ? +$('#a-prog').value : null };
    const ir0 = P(ev.iniReal), fr0 = P(ev.fimReal), fail0 = m => { err.textContent = m; return false; };
    if (fr0 != null && ir0 == null) return fail0('Informe o início real antes do fim real.');
    if (ir0 != null && fr0 != null && fr0 < ir0) return fail0('O fim real não pode ser antes do início real.');
    if ((ir0 != null && ir0 > T) || (fr0 != null && fr0 > T)) return fail0('Datas reais não podem estar no futuro.');
    if (fr0 != null && ev.progresso != null) ev.progresso = 100;
    ev.atualizadoEm = nowISO();
    if (await write(() => db.doc('atividades/' + a.id).update(ev))) { logEvt('edicao', a, `Lançamento: ${[ev.iniReal !== (a.iniReal || '') ? 'início real ' + fds(ir0) : '', ev.fimReal !== (a.fimReal || '') ? 'concluída em ' + fds(fr0) : '', ev.progresso !== (a.progresso ?? null) ? 'avanço ' + ev.progresso + '%' : ''].filter(Boolean).join(', ') || 'sem mudanças'}`); closeDrawer(); toast('Lançamento salvo.', 'ok'); if (fr0 != null && !a.fimReal && fr0 <= P(a.fimPlan)) celebrate(); }
    return;
  }
  const v = {""")

R("""    case 'open-proj': location.hash = projHash('painel', id); break;""", """    case 'open-proj': location.hash = projHash('painel', id); break;
    case 'usr-new': openUserModal(null); break;
    case 'usr-edit': openUserModal(id); break;
    case 'usr-pw': e.stopPropagation(); openResetPw(id); break;
    case 'usr-del': deleteUser(id, t); break;
    case 'usr-reload': loadAdmin(true); break;
    case 'bk-export': exportBackup(); break;
    case 'bk-import': openRestore(); break;
    case 'chg-pw': showChangePw(false); break;
    case 'sign-out': sb.auth.signOut(); break;""")

R("""function goView(h) {
  const r = parseHash(h);""", """function goView(h) {
  const r = parseHash(h);
  if (S.state === 'ready' && r.proj && r.proj !== '_none' && !metaById(r.proj)) { history.replaceState(null, '', '#projetos'); r.view = 'projetos'; r.proj = null; }""")

R("""data-act="new-meta">${ic('plus')}Novo projeto</button><button class="btn" data-act="import">${ic('up')}Importar planilha</button></div>""", """data-act="new-meta">${ic('plus')}Novo projeto</button><button class="btn" data-act="bk-import">${ic('up')}Restaurar backup</button><button class="btn" data-act="import">${ic('up')}Importar planilha</button></div>${S.isAdmin ? '<p class="muted" style="font-size:12.5px;margin:14px 0 0">Já tem um arquivo de backup (.json)? Use <b>Restaurar backup</b> para trazer seus projetos e atividades.</p>' : ''}""")

# ---------- 7. estilos e vendor ----------
R("/* ---------- table ---------- */", part('web.css') + "\n/* ---------- table ---------- */")
head = '''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121624">
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34 34'%3E%3Crect x='1' y='1' width='32' height='32' rx='9' fill='%232445d6'/%3E%3Cpath d='M7 24.5h20' stroke='%23fff' stroke-width='2.2' stroke-linecap='round'/%3E%3Cpath d='M17 9.5 23 21H11Z' fill='none' stroke='%23fff' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
</style>
'''
s = s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '', 1)
s = s.replace('<script>\n', '<script src="vendor/supabase.js"></script>\n<script>\n', 1)
s = head + s + '\n</body>\n</html>\n'
# o <title> e <style> do app vêm antes do <body>: embrulha o markup em <body>
i = s.index('<div class="app">')
s = s[:i] + '</head>\n<body>\n' + s[i:]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(s)
print('ok', len(s))
