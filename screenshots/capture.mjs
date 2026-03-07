import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlFile = path.join(__dirname, 'mockup-base.html');

const SIZES = [
  { label: '6.7inch', width: 430, height: 932, dpr: 3, name: 'iPhone 15 Pro Max' },
  { label: '6.5inch', width: 414, height: 896, dpr: 3, name: 'iPhone 11 Pro Max' },
];

const SCREENS = ['map', 'trail-detail', 'trip-tracking', 'conditions'];

(async () => {
  const browser = await chromium.launch();

  for (const size of SIZES) {
    const dir = path.join(__dirname, size.label);
    fs.mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: size.width * 2, height: size.height },
      deviceScaleFactor: size.dpr,
    });
    const page = await context.newPage();
    await page.goto(`file://${htmlFile}`);
    await page.waitForLoadState('networkidle');

    // Screenshot each phone mockup
    const phones = await page.$$('.phone');
    for (let i = 0; i < Math.min(phones.length, SCREENS.length); i++) {
      const outPath = path.join(dir, `${SCREENS[i]}.png`);
      await phones[i].screenshot({ path: outPath });
      console.log(`✓ ${size.label}/${SCREENS[i]}.png`);
    }

    await context.close();
  }

  await browser.close();
  console.log('\nAll screenshots saved to screenshots/6.7inch/ and screenshots/6.5inch/');
})();
