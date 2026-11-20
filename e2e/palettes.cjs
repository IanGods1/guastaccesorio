// Genera una hoja con la pantalla de inicio en cada color y modo (para revisar el aspecto).
// Uso:  npm run build:test && NODE_PATH=$(npm root -g) node e2e/palettes.cjs carpeta-de-salida
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dist-test');
const out = process.argv[2];
if (!out) throw new Error('Indica la carpeta de salida');
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(file, (err, data) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(data)));
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const { PALETTES } = await import('../src/core/theme.js');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 640 } })).newPage();
  await page.goto(url);
  const pw = page.locator('input[type=password]');
  for (let i = 0; i < 4; i++) await pw.nth(i).fill(i < 2 ? 'admin-secreta' : 'trabajo-123');
  await page.getByRole('button', { name: 'Crear contraseñas' }).click();
  await page.getByText('¿Qué modelo buscas?').waitFor();
  await page.evaluate(() => {
    window.__app.store.apply((d) => {
      for (const [n, b] of [['iPhone 13', 'Apple'], ['Galaxy A54', 'Samsung'], ['Redmi 12', 'Xiaomi']]) d.getOrCreateModel(n, b);
      return {};
    });
  });
  for (const mode of ['light', 'dark']) {
    for (const p of [...PALETTES.map((x) => x.id), '#e6c200']) {
      await page.evaluate(([m, c]) => { localStorage.setItem('gc_theme', m); localStorage.setItem('gc_color', c); }, [mode, p]);
      await page.reload();
      await page.getByText('¿Qué modelo buscas?').waitFor();
      await page.getByPlaceholder('Buscar modelo').fill('a');
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(out, `${mode}-${p.replace('#', '')}.png`) });
    }
  }
  await browser.close();
  server.close();
  console.log('listo');
})();
