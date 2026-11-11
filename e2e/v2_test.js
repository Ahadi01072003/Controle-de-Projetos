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
    await go(q, 'atividades--' + FUP); await q.check('#f-done').catch(() => {}); await q.waitForTimeout(300); await q.click('tr.row[data-id="act-early"]').catch(() => {}); await q.waitForTimeout(700);
    const chip = await q.$eval('#drawer .dr-h .st', e => e.textContent).catch(() => '');
    ok(/Concluída no prazo/.test(chip), `ficha mostra "${chip.trim()}"`);
    await ctx.close();
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
