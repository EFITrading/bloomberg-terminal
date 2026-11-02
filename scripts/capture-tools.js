const puppeteer = require('puppeteer');
const fs = require('fs');

const pages = [['regime', '/analysis-suite', 90000]];

(async () => {
  fs.mkdirSync('public/tools', { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  for (const [name, path, wait] of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.5 });
    await page.setCookie({ name: 'efi-level', value: 'admin', domain: 'localhost', path: '/' });
    try {
      await page.goto('http://localhost:3000' + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
    } catch (e) { console.log('goto', name, e.message); }
    await new Promise(r => setTimeout(r, wait));
    await page.screenshot({ path: `public/tools/${name}.png` });
    console.log('saved', name);
    await page.close();
  }
  await browser.close();
})();

