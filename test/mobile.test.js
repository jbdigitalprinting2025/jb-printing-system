// Mobile viewport test — runs the LIVE app in real Chrome at phone widths
// Logs in with the viewer test account and checks every page for overflow.
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'https://jbdigitalprinting2025.github.io/jb-printing-system/';
const EMAIL = 'mobiltest@jb.local';
const PASS = 'Mobi1Test!';
const WIDTHS = [360, 375, 390, 412, 768];
const PAGES = [
  ['dashboard', 'Dashboard'], ['calendar', 'Daily Calendar'], ['sales', 'Sales'],
  ['expenses', 'Expenses'], ['inventory', 'Inventory'], ['projects', 'Projects'],
  ['customers', 'Customers'], ['suppliers', 'Suppliers'], ['pnl', 'Profit'],
  ['reports', 'Reports'], ['settings', 'Settings']
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  let pass = 0, fail = 0;
  for (const w of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 800 });
    await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.log('load fail', w, e.message));
    // login
    try {
      await page.waitForSelector('#loginBtn', { timeout: 30000 });
      await page.type('#loginEmail', EMAIL);
      await page.type('#loginPass', PASS);
      await page.evaluate(() => document.getElementById('loginBtn').click());
      await page.waitForFunction(() => document.getElementById('appShell') && document.getElementById('appShell').classList.contains('visible'), { timeout: 30000 });
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) { console.log('LOGIN FAIL @' + w + 'px:', e.message); fail++; continue; }
    for (const [pg, label] of PAGES) {
      try {
        await page.evaluate((p) => { window.go(p); }, pg);
        await new Promise(r => setTimeout(r, 700)); // let charts render
        const res = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflow = doc.scrollWidth > window.innerWidth + 2;
          const clipped = [];
          document.querySelectorAll('.page.active *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > window.innerWidth + 2 && r.width > 0 && r.height > 0) {
              clipped.push(((el.className || el.id || el.tagName) + '').slice(0, 45));
            }
          });
          return { overflow, scrollW: doc.scrollWidth, innerW: window.innerWidth, clipped: clipped.slice(0, 6) };
        });
        if (res.overflow) { fail++; console.log('FAIL @' + w + 'px ' + label + ' — overflow scrollW=' + res.scrollW + ' innerW=' + res.innerW + ' clipped=' + JSON.stringify(res.clipped)); }
        else { pass++; }
      } catch (e) { fail++; console.log('FAIL @' + w + 'px ' + label + ' — ' + e.message); }
    }
    await page.close();
  }
  await browser.close();
  console.log(`\nMOBILE TEST RESULT: ${pass} passed, ${fail} failed (${WIDTHS.length * PAGES.length} checks)`);
  process.exit(fail ? 1 : 0);
})();
