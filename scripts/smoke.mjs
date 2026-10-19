/* global window */
// Headless smoke test: serve the production build, load it in Chromium,
// require N rendered frames and zero console errors / uncaught exceptions.
// Usage: npm run build && node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;
const MIN_FRAMES = 30;
const TIMEOUT_MS = 30_000;

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not start at ${url}`);
}

// Run Vite's entry point with node directly (not via npx) so that killing the
// child really stops the server instead of orphaning a grandchild process.
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const server = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const problems = [];
let browser;

try {
  await waitForServer(BASE_URL, 20_000);
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(BASE_URL);
  await page.waitForFunction((n) => window.__mm && window.__mm.frames >= n, MIN_FRAMES, {
    timeout: TIMEOUT_MS,
  });
  const frames = await page.evaluate(() => window.__mm.frames);
  console.log(`rendered ${frames} frames`);
} catch (e) {
  problems.push(`smoke test failed: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('smoke test passed');
