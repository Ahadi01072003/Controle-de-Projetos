const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.resolve('../site'), seed = fs.readFileSync(process.env.SEED || '../dados/backup.json', 'utf8'), fake = fs.readFileSync('fake_supabase.js', 'utf8');
const srv = http.createServer((q, r) => { let f = path.join(SITE, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const t = f.endsWith('.js') ? 'application/javascript' : 'text/html'; r.writeHead(200, { 'content-type': t }); r.end(fs.readFileSync(f)); }).listen(0);
(async () => {
  const port = srv.address().port, base = `http://localhost:${port}/`, b = await chromium.launch(), errs = [];
  const open = async (w = 1400, h = 900, scheme = 'light') => { const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.__SEED__=${seed};\n${fake}` })); return p; };
  const login = async (p, email, hash = '') => { await p.goto(base + hash); await p.waitForSelector('#flg'); await p.fill('#lg-e', email); await p.fill('#lg-p', 'senha1234'); await p.click('#lg-b'); await p.waitForTimeout(1600); };
  // 1. login errado
  let p = await open(); await p.goto(base); await p.waitForSelector('#flg'); await p.fill('#lg-e', 'admin@teste.com'); await p.fill('#lg-p', 'errada'); await p.click('#lg-b'); await p.waitForTimeout(500);
  console.log('erro login:', await p.textContent('#lg-err')); await p.screenshot({ path: 's1-login.png' });
  // 2. admin
  await p.fill('#lg-p', 'senha1234'); await p.click('#lg-b'); await p.waitForTimeout(1800); await p.screenshot({ path: 's2-admin-home.png' });
  console.log('admin projetos:', await p.$$eval('.mcard', e => e.length), '| nav:', (await p.$$eval('#nav a', e => e.map(x => x.textContent.trim()))).join(' / '));
  await p.evaluate(() => location.hash = 'usuarios'); await p.waitForTimeout(1200); await p.screenshot({ path: 's3-usuarios.png', fullPage: true });
  await p.click('[data-act="usr-new"]'); await p.waitForTimeout(600); await p.screenshot({ path: 's4-novo-usuario.png' });
  await p.fill('#u-nome', 'Maria Teste'); await p.fill('#u-email', 'maria@teste.com'); await p.selectOption('.lvsel >> nth=0', 'leitor'); await p.click('#fu button[type=submit]'); await p.waitForTimeout(900); await p.screenshot({ path: 's5-credenciais.png' });
  await p.click('#cred-copy').catch(() => {}); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  console.log('usuários depois:', await p.$$eval('.utbl tbody tr', e => e.length));
  await p.evaluate(() => location.hash = 'painel--q5xvihq5ti1zoqd8g39d'); await p.waitForTimeout(1200); await p.screenshot({ path: 's6-admin-painel-fup.png' });
  await p.close();
  // 3. gestor
  p = await open(); await login(p, 'gestor@teste.com'); await p.screenshot({ path: 's7-gestor-home.png' });
  console.log('gestor projetos:', await p.$$eval('.mcard', e => e.length), '| nav:', (await p.$$eval('#nav a', e => e.map(x => x.textContent.trim()))).join(' / '), '| botão novo projeto:', await p.$eval('#btnNova', e => !e.hidden));
  await p.evaluate(() => location.hash = 'atividades--q5xvihq5ti1zoqd8g39d'); await p.waitForTimeout(1200); await p.screenshot({ path: 's8-gestor-atividades.png' });
  console.log('gestor: botão nova atividade visível:', await p.$eval('#btnNova', e => !e.hidden), '| editar projeto:', await p.$eval('#btnEditProj', e => !e.hidden));
  await p.close();
  // 4. responsável
  p = await open(); await login(p, 'resp@teste.com'); console.log('resp: view =', await p.$eval('#vTitle', e => e.textContent), '| hash =', await p.evaluate(() => location.hash));
  await p.evaluate(() => location.hash = 'atividades--q5xvihq5ti1zoqd8g39d'); await p.waitForTimeout(1200); await p.screenshot({ path: 's9-resp-atividades.png' });
  console.log('resp: botões rápidos:', await p.$$eval('.tbl .qa button', e => e.length), '| total de linhas:', await p.$$eval('.tbl tr.row', e => e.length), '| chip:', await p.$eval('#roChip', e => e.hidden ? '(oculto)' : e.textContent.trim()), '| novo:', await p.$eval('#btnNova', e => !e.hidden));
  const own = await p.$('tr.row[data-id="k485uc1liexqrif2nopq"]'); if (own) { await own.click(); await p.waitForTimeout(700); await p.screenshot({ path: 's10-resp-ficha-propria.png' }); console.log('resp ficha própria: campos habilitados =', await p.$$eval('#fa input:not([disabled]):not([type=radio]), #fa select:not([disabled])', e => e.map(x => x.id).filter(Boolean).join(','))); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
  const other = await p.$('tr.row:not([data-id="k485uc1liexqrif2nopq"])'); if (other) { await other.click(); await p.waitForTimeout(700); console.log('resp ficha de outro: campos habilitados =', await p.$$eval('#fa input:not([disabled]):not([type=radio]), #fa select:not([disabled])', e => e.length)); }
  await p.close();
  // 5. leitor
  p = await open(); await login(p, 'leitor@teste.com', '#painel--q5xvihq5ti1zoqd8g39d'); await p.screenshot({ path: 's11-leitor.png' });
  console.log('leitor chip:', await p.$eval('#roChip', e => e.hidden ? '(oculto)' : e.textContent.trim()), '| novo:', await p.$eval('#btnNova', e => !e.hidden), '| url fora do acesso:', (await (async () => { await p.evaluate(() => location.hash = 'painel--erz2a7zu010i7o3743d8'); await p.waitForTimeout(500); return p.evaluate(() => location.hash); })()));
  await p.close();
  // 6. senha temporária e desativado
  p = await open(); await login(p, 'novo@teste.com'); await p.waitForSelector('#fcp'); await p.screenshot({ path: 's12-trocar-senha.png' });
  await p.fill('#cp1', 'curta'); await p.fill('#cp2', 'curta'); await p.click('#cp-b'); console.log('senha curta:', await p.textContent('#cp-err'));
  await p.fill('#cp1', 'novasenha123'); await p.fill('#cp2', 'novasenha123'); await p.click('#cp-b'); await p.waitForTimeout(1800); console.log('após trocar senha, tela:', await p.$eval('#vTitle', e => e.textContent), '| auth oculto:', await p.$eval('#auth', e => e.hidden));
  await p.close();
  p = await open(); await p.goto(base); await p.waitForSelector('#flg'); await p.fill('#lg-e', 'off@teste.com'); await p.fill('#lg-p', 'senha1234'); await p.click('#lg-b'); await p.waitForTimeout(1200); console.log('desativado:', (await p.textContent('.authcard h1')));
  await p.close();
  console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'sem erros de execução'); await b.close(); srv.close();
})();
