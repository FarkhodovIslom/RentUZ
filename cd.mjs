import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE-ERR:', msg.text().slice(0, 200)); });
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message.slice(0, 200)));
page.on('requestfailed', (req) => console.log('REQ-FAILED:', req.url().slice(0, 120), req.failure()?.errorText));
page.on('websocket', (ws) => {
  console.log('WS opened:', ws.url());
  ws.on('close', () => console.log('WS closed'));
});
await page.goto('http://localhost:3000/login');
// login as tenant (seeded)
const csrfRes = await page.request.get('http://localhost:3000/api/v1/csrf');
const { data } = await csrfRes.json();
const login = await page.request.post('http://localhost:3000/api/v1/auth/login', {
  headers: { 'x-rentuz-csrf': data.token },
  data: { phone: '+998902000000', password: 'paroltest12345' },
});
console.log('login status:', login.status());
await page.goto('http://localhost:3000/chat');
await page.waitForTimeout(6000);
const html = await page.content();
console.log('has empty state:', html.includes('Hali suhbatlar yo'));
await browser.close();
