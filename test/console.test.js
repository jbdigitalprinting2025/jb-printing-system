// Console error check on the live app (dashboard + a few pages)
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'https://jbdigitalprinting2025.github.io/jb-printing-system/';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 800 });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text().slice(0, 150)); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message.slice(0, 200)));
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#loginBtn');
  await page.type('#loginEmail', 'mobiltest@jb.local');
  await page.type('#loginPass', 'Mobi1Test!');
  await page.evaluate(() => document.getElementById('loginBtn').click());
  await page.waitForFunction(() => document.getElementById('appShell').classList.contains('visible'), { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  for (const pg of ['dashboard', 'sales', 'inventory', 'projects', 'pnl', 'reports', 'calendar', 'settings']) {
    await page.evaluate((p) => window.go(p), pg);
    await new Promise(r => setTimeout(r, 900));
  }
  const filtered = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver'));
  console.log('TOTAL JS ERRORS:', filtered.length);
  filtered.slice(0, 10).forEach(e => console.log('  ' + e));
  await browser.close();
  process.exit(filtered.length ? 1 : 0);
})();
