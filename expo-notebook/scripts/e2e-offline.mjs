// Airplane-mode end-to-end check against the production build.
// Usage: npm run build && node scripts/e2e-offline.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const step = (m) => console.log(`\n▶ ${m}`);
const fail = (m) => {
  console.error(`✖ ${m}`);
  process.exitCode = 1;
};

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && resolve());
  server.on('exit', reject);
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const tmp = mkdtempSync(join(tmpdir(), 'expo-e2e-'));
try {
  // 1. Render a realistic business card to a PNG.
  step('Rendering a sample business card');
  const cardPage = await browser.newPage({ viewport: { width: 1050, height: 600 } });
  await cardPage.setContent(`<body style="margin:0;background:#fff;font-family:Arial">
    <div style="padding:50px 60px">
      <div style="font-size:54px;font-weight:bold">SKYFORGE ROBOTICS PVT LTD</div>
      <div style="font-size:40px;margin-top:40px">Rahul Sharma</div>
      <div style="font-size:30px;color:#333">Director - Business Development</div>
      <div style="font-size:30px;margin-top:30px">M: +91 98765 43210</div>
      <div style="font-size:30px">rahul.sharma@skyforge.in</div>
      <div style="font-size:30px">www.skyforge.in</div>
    </div></body>`);
  const cardPath = join(tmp, 'card.png');
  writeFileSync(cardPath, await cardPage.screenshot());
  await cardPage.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const external = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(URL) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));

  step('First load online; waiting for service worker to precache everything');
  await page.goto(URL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // registerType=prompt: the page is controlled after a reload.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  for (const f of ['worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'eng.traineddata.gz', 'index.html']) {
    if (!cached.some((u) => u.includes(f))) fail(`not precached: ${f}`);
  }
  console.log(`  ${cached.length} URLs precached`);

  step('AIRPLANE MODE: going offline and reloading');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Expo Notebook' }).waitFor({ timeout: 10000 });
  console.log('  app shell loaded offline ✓');

  step('Adding a supplier by scanning the card (offline OCR)');
  await page.getByRole('button', { name: 'New supplier' }).click();
  const t0 = Date.now();
  await page.locator('label:has-text("Scan business card") input[type=file]').setInputFiles(cardPath);
  await page.getByText(/Filled \d+ fields?/).waitFor({ timeout: 90000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const val = (label) => page.getByLabel(label, { exact: true }).inputValue();
  const got = {
    company: await val('Company *'),
    person: await val('Person'),
    role: await val('Role'),
    phone: await val('Phone'),
    email: await val('Email'),
    website: await val('Website'),
  };
  console.log(`  OCR+parse took ${secs}s`, got);
  if (!/skyforge/i.test(got.company)) fail('company not filled');
  if (!/rahul/i.test(got.person)) fail('person not filled');
  if (!got.email.includes('skyforge.in')) fail('email not filled');
  if (!got.phone.replace(/\D/g, '').includes('9876543210')) fail('phone not filled');

  step('Editing, autosave, and navigating back');
  await page.getByRole('radio', { name: /Hot/ }).click();
  await page.getByLabel('Booth', { exact: true }).fill('B-42');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText(/SKYFORGE/i).first().waitFor();
  await page.getByRole('button', { name: 'Hot', exact: true }).click();
  if ((await page.getByText('Booth B-42').count()) !== 1) fail('supplier not in Hot filter / booth not saved');

  step('Reloading offline: data persisted');
  await page.reload();
  await page.getByText('Booth B-42').waitFor({ timeout: 5000 });

  step('Photos tab shows the card photo');
  await page.getByRole('button', { name: 'Photos' }).click();
  await page.getByText(/1 photos/).waitFor();

  step('Export backup offline');
  await page.getByRole('button', { name: 'Settings and backup' }).click();
  await page.getByRole('button', { name: /Export everything/ }).click();
  await page.getByRole('button', { name: /Share \/ Save/ }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Share \/ Save/ }).click(),
  ]);
  console.log(`  downloaded ${download.suggestedFilename()}`);
  await page.getByText(/Last backup: just now/).waitFor();

  if (external.length) fail(`external requests made: ${external.join(', ')}`);
  await page.screenshot({ path: join(tmp, 'final.png') });
  console.log(`\n${process.exitCode ? '✖ FAILED' : '✔ All offline checks passed'} (screens in ${tmp})`);
} finally {
  await browser.close();
  server.kill();
}
