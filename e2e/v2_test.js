// Testes das funções da v2 (avisos, minhas atividades, financeiro, produtividade, juntar pessoas, cópias, celular)
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.resolve('../site'), seed = fs.readFileSync(process.env.SEED || '../dados/backup.json', 'utf8'), fake = fs.readFileSync('fake_supabase.js', 'utf8'), csp = fs.readFileSync('csp.txt', 'utf8');
const srv = http.createServer((q, r) => { let f = path.join(SITE, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html', 'content-security-policy': csp }); r.end(fs.readFileSync(f)); }).listen(0);
const FUP = 'q5xvihq5ti1zoqd8g39d'; let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALHA') + ' ' + msg); if (!c) fails++; };
(async () => {
  const base = `http://localhost:${srv.address().port}/`, b = await chromium.launch(), errs = [];
  const open = async (w = 1400, h = 900) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.__SEED__=${seed};window.__FIN_DEMO__=1;\n${fake}` })); return p; };
  const login = async (p, email) => { await p.goto(base); await p.waitForSelector('#flg'); await p.fill('#lg-e', email); await p.fill('#lg-p', 'senha1234'); await p.click('#lg-b'); await p.waitForTimeout(1700); };
  const go = async (p, h) => { await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(1100); };
  const T = (p, f, a) => p.evaluate(f, a);

  // 1. responsável: cai em Minhas atividades, sino com aviso de atividade nova, abre a ficha e marca como lido
  let p = await open(); await login(p, 'resp@teste.com');
  ok(await p.evaluate(() => location.hash) === '#minhas', 'responsável abre em Minhas atividades');
  const n0 = +(await p.$eval('#bellN', e => e.hidden ? 0 : e.textContent));
  ok(n0 > 0, `sino mostra avisos (${n0})`);
  ok(await p.$$eval('.my.new', e => e.length) >= 1, 'atividade nova destacada na lista');
  await p.click('#btnBell'); await p.waitForTimeout(300);
  const novas = await p.$$eval('#bellPop .al.un', e => e.length); ok(novas >= 1, `aba "Novas para você" tem ${novas} aviso(s)`);
  const tit = await p.$eval('#bellPop .al .al-t', e => e.textContent.trim());
  await p.click('#bellPop .al'); await p.waitForTimeout(900);
  ok((await p.$eval('#drTitle', e => e.textContent.trim())) === tit, 'clicar no aviso abre a ficha da atividade');
  ok(await p.$eval('#a-obs', e => !e.disabled) && await p.$eval('#a-titulo', e => e.disabled), 'responsável edita as observações da própria atividade (o resto continua travado)');
  const actId = await p.evaluate(() => S.editing && S.editing.id);
  await p.fill('#a-obs', 'Material chega na sexta'); await p.click('#fa button[type=submit]'); await p.waitForTimeout(900);
  ok(await T(p, id => (window.__T__.docs.find(d => d.id === id) || {}).data.obs, actId) === 'Material chega na sexta', 'observação do responsável gravada');
  await p.click(`[data-act="my-open"][data-id="${actId}"]`).catch(() => {}); await p.waitForTimeout(700);
  await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  const st = await T(p, () => window.__T__.user_state[0] && Object.keys(window.__T__.user_state[0].data.lidas).length);
  ok(st >= 1, 'aviso lido gravado no banco (user_state)');
  ok(+(await p.$eval('#bellN', e => e.hidden ? 0 : e.textContent)) === n0 - 1, 'contador do sino diminuiu');
  await p.close();

  // 2. gestor com acesso financeiro: lança pagamento, edita contrato, exclui; histórico registrado
  p = await open(); await login(p, 'gestor@teste.com'); await go(p, 'painel--' + FUP);
  ok(await p.$('.fin-pc') !== null, 'painel mostra o cartão financeiro');
  const progPainel = await p.$eval('.kpi:first-child .val', e => e.textContent.trim());
  await go(p, 'financeiro--' + FUP);
  const progGraf = await p.$eval('#fgap b', e => e.textContent.trim());
  ok(progGraf === progPainel, `avanço real do gráfico igual ao Progresso geral do painel (${progGraf} = ${progPainel})`);
  ok(await p.$$eval('#fchart svg path.draw', e => e.length) === 3, 'gráfico com avanço real, executado e pago');
  const aPagar = async () => p.$eval('.fin-k .kpi:nth-child(8) .val', e => e.textContent.trim());
  const before = await aPagar();
  await p.click('[data-act="fin-tab"][data-t="pagamento"]'); await p.waitForTimeout(300);
  await p.click('[data-act="fin-new"]'); await p.waitForTimeout(400);
  await p.fill('#fi-ds', 'Medição 3'); await p.fill('#fi-v', '10.000,00'); await p.click('#ffi button[type=submit]'); await p.waitForTimeout(900);
  const after = await aPagar(); const num = s => +s.replace(/[^\d,-]/g, '').replace(',', '.');
  ok(Math.round(num(before) - num(after)) === 10000, `pagamento reduz o saldo a pagar (${before} → ${after})`);
  await p.click('[data-act="fin-tab"][data-t="fd"]'); await p.waitForTimeout(300); await p.click('[data-act="fin-new"]'); await p.waitForTimeout(300);
  await p.fill('#fi-ds', 'Compra de 500 tijolos'); await p.fill('#fi-q', '500'); await p.fill('#fi-u', '1,20');
  ok((await p.inputValue('#fi-v')) === '600,00', 'quantidade × valor unitário calcula o total do FD');
  const aj0 = await p.$eval('.fin-k .kpi:nth-child(4) .val', e => e.textContent);
  await p.click('#ffi button[type=submit]'); await p.waitForTimeout(900);
  const aj1 = await p.$eval('.fin-k .kpi:nth-child(4) .val', e => e.textContent);
  ok(Math.round(num(aj0) - num(aj1)) === 600, `faturamento direto abate do valor ajustado (${aj0} → ${aj1})`);
  await p.click('[data-act="fin-contrato"]'); await p.waitForTimeout(300); await p.fill('#fc-v', '500.000,00'); await p.click('#ffc button[type=submit]'); await p.waitForTimeout(800);
  ok((await p.$eval('.fin-k .kpi:nth-child(1) .val', e => e.textContent)).includes('500.000,00'), 'valor do contrato editado');
  await p.click('tr.row[data-act="fin-edit"] >> nth=0'); await p.waitForTimeout(400); await p.click('[data-act="fin-del"]'); await p.click('[data-act="fin-del"]'); await p.waitForTimeout(800);
  ok(await T(p, () => window.__T__.fin_log.filter(l => l.acao === 'delete').length) === 1, 'exclusão registrada no histórico');
  await p.click('[data-act="fin-tab"][data-t="log"]'); await p.waitForTimeout(300);
  ok(await p.$$eval('.fin-log li', e => e.length) >= 4, 'aba Histórico lista as alterações');
  await p.close();

  // 2b. financeiro por atividade: valores fecham com o contrato, medição, ficha
  p = await open(); await login(p, 'gestor@teste.com'); await go(p, 'financeiro--' + FUP);
  ok(await p.$('.fatbl') !== null, 'aba "Por atividade" abre por padrão');
  ok(await p.$('.fa-dist.ok') !== null, 'sem valores definidos, a distribuição automática fecha com o contrato');
  const firstAid = await p.$eval('.fatbl .fvin', e => e.dataset.a);
  await p.fill(`.fvin[data-a="${firstAid}"][data-s=""]`, '50.000,00'); await p.press(`.fvin[data-a="${firstAid}"][data-s=""]`, 'Enter'); await p.waitForTimeout(900);
  ok(await T(p, a => window.__T__.fin_valores.some(v => v.atividade_id === a && +v.valor === 50000), firstAid), 'valor digitado gravado para a atividade');
  ok(await p.$('.fa-dist.ok') !== null, 'com um valor fixo, o resto se redistribui e continua fechando');
  ok(await p.$(`.fvin.man[data-a="${firstAid}"]`) !== null, 'atividade fica marcada como valor definido');
  await p.uncheck('#fin-auto'); await p.waitForTimeout(900);
  ok(await p.$('.fa-dist.warn') !== null, 'desligar a distribuição automática mostra quanto falta distribuir');
  await p.check('#fin-auto'); await p.waitForTimeout(900);
  const execTot = await p.$eval('.fatbl tfoot td:nth-child(4)', e => e.textContent.trim());
  await p.click('[data-act="fin-med"] >> nth=0'); await p.waitForTimeout(500);
  const sug = await p.$$eval('.md-ck:checked', e => e.length);
  ok(sug > 0, `medição sugere ${sug} atividade(s) executada(s) e não paga(s) (executado total ${execTot})`);
  const nMed = await p.inputValue('#md-n');
  await p.click('#fmd button[type=submit]'); await p.waitForTimeout(1000);
  const lig = await T(p, n => window.__T__.fin_itens.filter(i => i.medicao === n && i.atividade_id).length, nMed);
  ok(lig === sug, `medição ${nMed} gerou ${lig} pagamentos ligados às atividades`);
  await p.click('[data-act="fin-med"] >> nth=0'); await p.waitForTimeout(500);
  ok(await p.$$eval('.md-ck:checked', e => e.length) === 0, 'depois de medir, não sobra nada a medir');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await go(p, 'atividades--' + FUP); await p.check('#f-done').catch(() => {}); await p.waitForTimeout(300);
  await p.click(`tr.row[data-id="${firstAid}"]`); await p.waitForTimeout(900);
  const box = await p.$eval('#a-fin', e => e.textContent).catch(() => '');
  ok(/Valor/.test(box) && /50\.000,00/.test(box), 'ficha da atividade mostra o quadro financeiro com o valor definido');
  await p.close();
  p = await open(); await login(p, 'leitor@teste.com'); await go(p, 'atividades--' + FUP); await p.check('#f-done').catch(() => {}); await p.waitForTimeout(300);
  await p.click(`tr.row[data-id="${firstAid}"]`).catch(() => {}); await p.waitForTimeout(700);
  ok(await p.$('#a-fin') === null, 'quem não tem acesso financeiro não vê o quadro na ficha');
  await p.close();

  // 3. leitor sem financeiro: vê só os totais
  p = await open(); await login(p, 'leitor@teste.com'); await go(p, 'painel--' + FUP);
  ok(await p.$('.fin-pc') !== null, 'leitor vê os totais financeiros no painel');
  ok(!(await p.$$eval('#nav a', e => e.some(a => a.textContent.includes('Financeiro')))), 'leitor não vê o módulo Financeiro no menu');
  await go(p, 'financeiro--' + FUP);
  ok((await p.$eval('#view', e => e.textContent)).includes('Sem acesso ao financeiro'), 'leitor bloqueado na tela Financeiro');
  await p.close();

  // 4. administrador: produtividade, juntar pessoas, cópia agora, acesso financeiro na matriz
  p = await open(); await login(p, 'admin@teste.com'); await go(p, 'reuniao--' + FUP);
  await p.click('[data-act="rp-q"] >> nth=2').catch(() => {}); await p.waitForTimeout(700);
  const prow = await p.$$eval('.pd-row', e => e.length); ok(prow > 0, `ranking de produtividade com ${prow} pessoas`);
  const firstName = await p.$eval('.pd-row .who span:last-child', e => e.textContent);
  await p.click('[data-act="prod-hide"]'); await p.waitForTimeout(300);
  ok((await p.$eval('.pd-row .who span:last-child', e => e.textContent)).startsWith('Pessoa'), `ocultar nomes troca "${firstName}" por "Pessoa A"`);
  await p.click('[data-act="present"]'); await p.waitForTimeout(400); await p.click('[data-act="pr-next"]'); await p.waitForTimeout(400);
  ok((await p.$eval('#present h2', e => e.textContent)).includes('Produtividade'), 'produtividade aparece no modo apresentação');
  await p.keyboard.press('Escape');
  await go(p, 'responsaveis--' + FUP);
  const ids = await T(p, () => { const ps = window.__T__.docs.filter(d => d.coll === 'pessoas'); const f = n => (ps.find(x => x.data.nome === n) || {}).id; return { dupla: f('Jorge/Thiago'), jorge: f('Jorge'), thiago: f('Thiago') }; });
  if (ids.dupla && ids.jorge && ids.thiago) {
    const actId = await T(p, id => (window.__T__.docs.find(d => d.coll === 'atividades' && d.data.respId === id) || {}).id, ids.dupla);
    await p.click(`[data-act="merge-pessoa"][data-id="${ids.dupla}"]`); await p.waitForTimeout(400);
    await p.selectOption('#mg-p', ids.jorge); await p.selectOption('#mg-a', ids.thiago); await p.click('#fmg button[type=submit]'); await p.waitForTimeout(1500);
    const a = await T(p, id => window.__T__.docs.find(d => d.coll === 'atividades' && d.id === id).data, actId);
    ok(a.respId === ids.jorge && (a.apoioIds || []).includes(ids.thiago), 'dividir "Jorge/Thiago": Jorge responsável, Thiago no apoio');
    ok(!(await T(p, id => window.__T__.docs.some(d => d.coll === 'pessoas' && d.id === id), ids.dupla)), 'cadastro duplo excluído');
  } else ok(false, 'pessoas de teste não encontradas');
  await go(p, 'usuarios'); await p.waitForTimeout(500);
  await p.click('[data-act="bk-now"]'); await p.waitForTimeout(900);
  ok(await p.$$eval('[data-act="bk-get"]', e => e.length) === 1, 'cópia manual aparece na lista');
  await p.click('tr.row[data-act="usr-edit"]:has-text("Leitor FUP")'); await p.waitForTimeout(500);
  await p.check(`.finchk[data-p="${FUP}"]`); await p.click('#fu button[type=submit]'); await p.waitForTimeout(900);
  ok(await T(p, f => window.__T__.project_members.some(m => m.user_id === 'u-leit' && m.project_id === f && m.fin), FUP), 'acesso financeiro gravado para o usuário');
  await go(p, 'atividades--' + FUP);
  ok(!(await p.$$eval('.tbl tr.row', e => e.some(r => /Concluída/.test(r.textContent)))), 'concluídas ficam ocultas por padrão');
  await p.check('#f-done'); await p.waitForTimeout(400);
  ok(await p.$$eval('.tbl tr.row', e => e.some(r => /Concluída/.test(r.textContent))), '"Mostrar concluídas" traz as concluídas de volta');
  await p.close();

  // 5. diário: concluir antes do fim planejado fecha em 100% (responsável)
  {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const q = await ctx.newPage();
    q.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await q.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.__SEED__=${seed};window.__DAILY__=1;\n${fake}` }));
    await login(q, 'resp@teste.com'); await go(q, 'diario--' + FUP);
    const real0 = await q.$eval('.drow[data-id="act-early"] .dm-txt b', e => e.textContent);
    ok(await q.$('.drow[data-id="act-early"] [data-act="dfin"]') !== null, `diário mostra "Concluir hoje" para atividade em ${real0} que termina depois de hoje`);
    await q.click('.drow[data-id="act-early"] [data-act="dset"][data-v="100"]'); await q.waitForTimeout(700);
    ok((await q.$$eval('.toast', e => e.map(x => x.textContent).join(' '))).includes('Terminou antes do previsto'), 'marcar "Feito" hoje oferece concluir antes do previsto');
    await q.click('.drow[data-id="act-early"] [data-act="dfin"]'); await q.waitForTimeout(900);
    const a1 = await q.evaluate(() => window.__T__.docs.find(d => d.id === 'act-early').data);
    ok(!!a1.fimReal, 'concluir registra o fim real hoje');
    ok((await q.$eval('.drow[data-id="act-early"] .dm-txt b', e => e.textContent)) === '100%', 'atividade concluída aparece com 100% no diário');
    await q.click('.drow[data-id="act-et"][data-sid="e1"] [data-act="dfin"]'); await q.waitForTimeout(900);
    const e1 = await q.evaluate(() => window.__T__.docs.find(d => d.id === 'act-et').data.etapas[0]);
    ok(!!e1.fimReal, 'etapa concluída antes do fim planejado');
    ok((await q.$eval('.drow[data-id="act-et"][data-sid="e1"] .dm-txt b', e => e.textContent)) === '100%', 'etapa concluída aparece com 100% no diário');
    ok(await q.$('.dsec .drow[data-id="act-fut"]') !== null && (await q.$$eval('.dsec-h h3', e => e.map(x => x.textContent))).includes('Antes do previsto'), 'diário mostra "Antes do previsto" com atividade que começa em 3 dias');
    await q.click('.drow[data-id="act-fut"] [data-act="dset"][data-v="100"]'); await q.waitForTimeout(900);
    const af = await q.evaluate(() => window.__T__.docs.find(d => d.id === 'act-fut').data);
    ok(!!af.iniReal && af.iniReal < af.iniPlan, `marcar "Feito" antes do plano registra o início real (${af.iniReal}, plano ${af.iniPlan})`);
    await go(q, 'atividades--' + FUP);
    const tag = await q.$eval('tr.row[data-id="act-fut"] .early', e => e.textContent).catch(() => '');
    ok(/começou 3 d antes/.test(tag), `lista mostra o selo "${tag}"`);
    const st = await q.$eval('tr.row[data-id="act-fut"] .st', e => e.textContent).catch(() => '');
    ok(/Em andamento/.test(st), `atividade adiantada fica "${st}"`);
    await go(q, 'atividades--' + FUP); await q.check('#f-done').catch(() => {}); await q.waitForTimeout(300); await q.click('tr.row[data-id="act-early"]').catch(() => {}); await q.waitForTimeout(700);
    const chip = await q.$eval('#drawer .dr-h .st', e => e.textContent).catch(() => '');
    ok(/Concluída no prazo/.test(chip), `ficha mostra "${chip.trim()}"`);
    await ctx.close();
  }

  // 5b. datas reais escolhidas, correção de cadastro × replanejamento, ficha da etapa
  {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const q = await ctx.newPage();
    q.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await q.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.__SEED__=${seed};window.__DAILY__=1;\n${fake}` }));
    await login(q, 'gestor@teste.com'); await go(q, 'atividades--' + FUP);
    const yest = await q.evaluate(() => ISO(today() - 1));
    // Iniciar pergunta a data
    const startBtn = await q.$('.tbl tr.row [data-act="start"]'); const sid0 = startBtn && await startBtn.evaluate(b => b.dataset.id);
    await startBtn.click(); await q.waitForTimeout(400);
    ok(await q.$('#fw') !== null, '"Iniciar" pergunta a data em vez de gravar hoje direto');
    await q.fill('#fw-d', yest); await q.click('#fw button[type=submit]'); await q.waitForTimeout(800);
    ok(await T(q, id => window.__T__.docs.find(d => d.id === id).data.iniReal, sid0) === yest, `início real gravado na data escolhida (${yest})`);
    // correção de cadastro: não conta como replanejamento e corrige o plano original
    const tgt = await q.evaluate(() => { const d = window.__T__.docs.find(x => x.coll === 'atividades' && x.data.metaId === 'q5xvihq5ti1zoqd8g39d' && !(x.data.replans || []).length && !(x.data.etapas || []).length && !x.data.fimReal); return d && { id: d.id, fim: d.data.fimPlan }; });
    await go(q, 'atividades--' + FUP); await q.click(`tr.row[data-id="${tgt.id}"]`); await q.waitForTimeout(700);
    const novoFim = await q.evaluate(f => ISO(P(f) + 2), tgt.fim);
    await q.fill('#a-fim', novoFim); await q.click('#fa button[type=submit]'); await q.waitForTimeout(500);
    ok(await q.$('input[name="rp-tipo"][value="correcao"]') !== null, 'ao mudar o plano, o gestor escolhe entre replanejamento e correção');
    await q.click('.rp-tipo label:has(input[value="correcao"])'); await q.click('#frp button[type=submit]'); await q.waitForTimeout(900);
    const d1 = await T(q, id => window.__T__.docs.find(d => d.id === id).data, tgt.id);
    ok(!(d1.replans || []).length && (d1.correcoes || []).length === 1 && d1.fimOrig === novoFim && d1.fimPlan === novoFim, 'correção não vira replanejamento e ajusta o plano original');
    // reclassificar replanejamento antigo
    const rep = await q.evaluate(() => { const d = window.__T__.docs.find(x => x.coll === 'atividades' && x.data.metaId === 'q5xvihq5ti1zoqd8g39d' && (x.data.replans || []).length >= 1 && !(x.data.etapas || []).length); return d && { id: d.id, n: d.data.replans.length, fimPara: d.data.replans[0].fimPara }; });
    await go(q, 'atividades--' + FUP); await q.check('#f-done').catch(() => {}); await q.waitForTimeout(300); await q.click(`tr.row[data-id="${rep.id}"]`); await q.waitForTimeout(700);
    await q.click('#a-more summary'); await q.waitForTimeout(200); const btns = await q.$$('[data-act="rp-fix"]'); const last = btns[btns.length - 1];
    await last.click(); await last.click(); await q.waitForTimeout(900);
    const d2 = await T(q, id => window.__T__.docs.find(d => d.id === id).data, rep.id);
    ok((d2.replans || []).length === rep.n - 1 && (d2.correcoes || []).length === 1 && d2.fimOrig === rep.fimPara, `replanejamento 1 reclassificado como correção (${rep.n} → ${(d2.replans || []).length} replanejamentos)`);
    await q.keyboard.press('Escape'); await q.waitForTimeout(400); await q.close(); await ctx.close();
    // ficha da etapa, vista pelo responsável
    const ctx2 = await b.newContext({ viewport: { width: 1400, height: 900 } }); const r2 = await ctx2.newPage(); r2.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await r2.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.__SEED__=${seed};window.__DAILY__=1;\n${fake}` }));
    await login(r2, 'resp@teste.com'); await go(r2, 'cronograma--' + FUP);
    await r2.click('[data-act="tog-sub"][data-id="act-et"]').catch(() => {}); await r2.waitForTimeout(500);
    await r2.click('.g-label[data-act="edit-sub"][data-sid="e2"]'); await r2.waitForTimeout(800);
    ok((await r2.$eval('#drTitle', e => e.textContent)) === 'Acabamento', 'clicar na etapa abre a ficha completa da etapa');
    ok(await r2.$eval('#et-nome', e => e.disabled) && !(await r2.$eval('#et-inir', e => e.disabled)), 'responsável lança na etapa dele, mas não muda o plano');
    ok(await r2.$('.et-parent') !== null, 'ficha da etapa leva de volta à atividade');
    await r2.fill('#et-inir', await r2.evaluate(() => ISO(today()))); await r2.click('#fet button[type=submit]'); await r2.waitForTimeout(900);
    ok(!!(await T(r2, () => window.__T__.docs.find(d => d.id === 'act-et').data.etapas[1].iniReal)), 'início real da etapa salvo pela ficha da etapa');
    await ctx2.close();
  }

  // 5c. cronograma: coluna de nomes ajustável, sem área em branco, meses padronizados
  {
    const g = await open(); await login(g, 'gestor@teste.com');
    const pids = await g.evaluate(() => S.metas.map(m => m.id));
    let blank = 0, bad = [], misal = 0;
    for (const pid of pids) for (const z of ['semana', 'mes', 'tri']) {
      await g.evaluate(([pid, z]) => { S.zoom = z; location.hash = 'cronograma--' + pid; render(); }, [pid, z]); await g.waitForTimeout(500);
      const r = await g.evaluate(() => { const w = document.querySelector('#gwrap'), gt = document.querySelector('.gantt'); return w ? { a: w.clientWidth, g: gt.offsetWidth, sw: w.scrollWidth, ms: [...document.querySelectorAll('.g-scale .m')].map(m => m.textContent) } : null; });
      if (!r) continue;
      if (r.g < r.a - 1 || r.sw > Math.max(r.g, r.a) + 1) blank++;
      bad.push(...r.ms.filter(t => t && !/^[A-ZÇ][a-zç]+ \d{4}$/.test(t)));
      if (z === 'mes') misal += await g.evaluate(() => { const tl = new Set([...document.querySelectorAll('.g-scale .t')].map(t => Math.round(parseFloat(t.style.left)))); return [...document.querySelectorAll('.g-scale .m')].slice(1).filter(m => !tl.has(Math.round(parseFloat(m.style.left)))).length; });
    }
    ok(blank === 0, 'cronograma ocupa a largura toda e termina no fim (sem caixa em branco), em todas as escalas');
    ok(misal === 0, `na escala Mês, todo início de mês coincide com uma divisória de coluna (${misal} desalinhados)`);
    ok(!bad.length, `meses sempre no mesmo padrão "Mês AAAA"${bad.length ? ' — fora: ' + bad.slice(0, 3).join(', ') : ''}`);
    await g.evaluate(pid => { S.zoom = 'mes'; location.hash = 'cronograma--' + pid; render(); }, FUP); await g.waitForTimeout(600);
    const lw0 = await g.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.gantt')).getPropertyValue('--lw')));
    const hb = await (await g.$('.g-rs')).boundingBox();
    await g.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await g.mouse.down(); await g.mouse.move(hb.x + 125, hb.y + 10, { steps: 6 }); await g.mouse.up(); await g.waitForTimeout(500);
    const lw1 = await g.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.gantt')).getPropertyValue('--lw')));
    ok(Math.abs(lw1 - lw0 - 120) < 6, `arrastar a divisória alarga a coluna de nomes (${lw0} → ${lw1}px)`);
    ok(+(await g.evaluate(() => localStorage.getItem('controle-projetos.glw'))) === lw1, 'largura escolhida fica guardada');
    const trunc0 = await g.$$eval('.g-label .nm', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).length);
    await g.dblclick('.g-rs'); await g.waitForTimeout(600);
    const trunc1 = await g.$$eval('.g-label .nm', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).length);
    ok(trunc0 > 0 && trunc1 === 0, `clique duplo ajusta ao maior nome (${trunc0} cortados → ${trunc1})`);
    const r2 = await g.evaluate(() => { const w = document.querySelector('#gwrap'), gt = document.querySelector('.gantt'); return { a: w.clientWidth, g: gt.offsetWidth }; });
    ok(r2.g >= r2.a - 1, 'mesmo com a coluna larga, nada em branco no fim');
    await g.close();
  }

  // 5d. cronograma: barra do plano num tom só; barra preta de avanço proporcional ao %
  {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const q = await ctx.newPage();
    q.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await q.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.__SEED__=${seed};window.__DAILY__=1;\n${fake}` }));
    await login(q, 'gestor@teste.com');
    await q.evaluate(() => { S.zoom = 'mes'; S.open.add('act-et'); location.hash = 'cronograma--q5xvihq5ti1zoqd8g39d'; render(); }); await q.waitForTimeout(800);
    ok(await q.$$eval('.g-plan .gp-fill, .g-sum i', e => e.length) === 0, 'barra azul do plano em um tom só (sem preenchimento mais escuro por dentro)');
    const rows = await q.evaluate(() => [...document.querySelectorAll('.g-row')].map(r => { const pl = r.querySelector('.g-plan'), re = r.querySelector('.g-real'), pc = r.querySelector('.g-pct');
      return pl && re && pc ? { pct: parseFloat(pc.textContent), pl: [parseFloat(pl.style.left), parseFloat(pl.style.width)], re: [parseFloat(re.style.left), parseFloat(re.style.width)] } : null; }).filter(Boolean));
    const off = rows.filter(r => Math.abs(r.re[1] - Math.max(3, r.pct / 100 * r.pl[1])) > 1.5);
    ok(rows.length >= 3 && !off.length, `barra preta mede o % do avanço sobre a barra do plano (${rows.length} conferidas${off.length ? ', ' + off.length + ' fora' : ''})`);
    const half = rows.find(r => r.pct === 50 && Math.abs(r.re[0] - r.pl[0]) < 1);
    ok(half && Math.abs(half.re[0] + half.re[1] - (half.pl[0] + half.pl[1] / 2)) < 1.5, '50% termina exatamente na metade da barra azul');
    await ctx.close();
  }

  // 5e. cadastro geral de responsáveis; excluir pessoa transferindo; excluir projeto apaga tudo dentro
  {
    const ad = await open(); await login(ad, 'admin@teste.com'); await go(ad, 'pessoas');
    const nP = await T(ad, () => S.pessoas.length);
    ok(await ad.$$eval('.pctbl tbody tr', e => e.length) === nP, `tela Responsáveis lista todas as ${nP} pessoas cadastradas`);
    ok(await ad.$('#nav a[data-v="pessoas"]') !== null, 'Responsáveis aparece no menu geral');
    // pessoa com atividades: transfere para outra
    const alvo = await T(ad, () => { const c = {}; S.atividades.forEach(a => { if (a.respId) c[a.respId] = (c[a.respId] || 0) + 1; }); const id = Object.keys(c).sort((x, y) => c[x] - c[y])[0]; return { id, n: c[id], para: S.pessoas.find(p => p.id !== id).id }; });
    await ad.click(`[data-act="pc-del"][data-id="${alvo.id}"]`); await ad.waitForTimeout(400);
    ok(await ad.$eval('#fdp .del-list', e => /atividade/.test(e.textContent)), 'janela de exclusão mostra onde a pessoa está em uso');
    await ad.selectOption('#dp-para', alvo.para); await ad.click('#dp-go'); await ad.waitForTimeout(1200);
    const d1 = await T(ad, ([id, para]) => ({ gone: !window.__T__.docs.some(d => d.coll === 'pessoas' && d.id === id), left: window.__T__.docs.filter(d => d.coll === 'atividades' && JSON.stringify(d.data).includes(id)).length, moved: window.__T__.docs.filter(d => d.coll === 'atividades' && d.data.respId === para).length, ui: S.pessoas.some(p => p.id === id) }), [alvo.id, alvo.para]);
    ok(d1.gone && !d1.ui && d1.left === 0, 'responsável excluído e nenhuma atividade ou etapa ficou apontando para ele');
    ok(d1.moved >= alvo.n, `as ${alvo.n} atividades dele passaram para a pessoa escolhida`);
    ok(await T(ad, () => window.__T__.backups.length) >= 1, 'cópia de segurança feita antes de excluir');
    // excluir projeto: pede o nome e apaga atividades e etapas
    const pj = await T(ad, () => { const m = S.metas.find(x => S.atividades.some(a => a.metaId === x.id)); return { id: m.id, nome: m.nome, n: S.atividades.filter(a => a.metaId === m.id).length }; });
    await go(ad, 'painel--' + pj.id); await ad.click('.np-edit'); await ad.waitForTimeout(400);
    await ad.click('[data-act="del-meta"]'); await ad.waitForTimeout(400);
    ok(await ad.$eval('#dm-go', b => b.disabled), 'excluir projeto só libera depois de digitar o nome');
    await ad.fill('#dm-nome', pj.nome); await ad.waitForTimeout(100);
    ok(!(await ad.$eval('#dm-go', b => b.disabled)), 'nome digitado libera o botão');
    await ad.click('#dm-go'); await ad.waitForTimeout(1300);
    const d2 = await T(ad, id => ({ meta: window.__T__.docs.some(d => d.coll === 'metas' && d.id === id), acts: window.__T__.docs.filter(d => d.coll === 'atividades' && d.data.metaId === id).length, orf: S.atividades.filter(a => !a.metaId).length, hash: location.hash }), pj.id);
    ok(!d2.meta && d2.acts === 0, `projeto excluído junto com as ${pj.n} atividades e etapas (nada ficou "sem projeto")`);
    ok(d2.hash === '#projetos', 'volta para a lista de projetos depois de excluir');
    await ad.close();
    // gestor (não admin) vê o cadastro, mas não exclui
    const gs = await open(); await login(gs, 'gestor@teste.com'); await go(gs, 'pessoas');
    ok(await gs.$('.pctbl') !== null && await gs.$('[data-act="pc-del"]') === null, 'gestor vê o cadastro de responsáveis, mas não tem botão de excluir');
    await gs.close();
  }

  // 6. celular: barra de baixo e "Mais" com sair
  p = await open(390, 844); await login(p, 'admin@teste.com'); await go(p, 'painel--' + FUP);
  ok(await p.$eval('#mnav', e => getComputedStyle(e).display !== 'none' && e.querySelectorAll('a').length >= 4), 'barra de navegação embaixo no celular');
  await p.click('[data-act="m-more"]'); await p.waitForTimeout(400);
  ok(await p.$eval('.sheet-p', e => /Sair/.test(e.textContent) && /Financeiro/.test(e.textContent)), '"Mais" mostra o menu completo e o Sair');
  await p.close();

  console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros de execução');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await b.close(); srv.close(); process.exit(fails || errs.length ? 1 : 0);
})();
