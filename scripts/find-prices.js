#!/usr/bin/env node
// Finds every price a visitor can see on a website, including the prices that
// only appear after clicking a term (1 / 3 / 6 / 12 months) or another option.
//
// Usage: node scripts/find-prices.js <domain-or-url> [--out prices/<domain>-<date>] [--max 80] [--only "seo,ppc"]
// Writes:  <out>/prices.json   every price card found, per page and per option
//          <out>/prices.csv    the same as a spreadsheet (one row per price)
// Prints a readable summary.
//
// Only reads the site: plain page loads and on-page option clicks. It never
// submits forms, adds to cart or pays. Requests other than GET are blocked.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
let start = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
if (!start) { console.error('Usage: node scripts/find-prices.js <domain> [--out dir] [--max 80] [--only "seo,ppc"]'); process.exit(1); }
if (!/^https?:\/\//.test(start)) start = 'https://' + start;
const origin = new URL(start).origin;
const host = new URL(start).hostname.replace(/^www\./, '');
const today = new Date().toISOString().slice(0, 10);
const OUT = opt('--out', path.join('prices', `${host}-${today}`));
const MAX = +opt('--max', 80);
const ONLY = (opt('--only', '') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const SKIP = /\/(cdn-cgi|users\/|login|register|cart|checkout|dashboard|account|password|orders?\/details|admin)|\.(pdf|jpe?g|png|zip|svg)$/i;

// Runs in the page: find price cards that are visible right now.
function readCards() {
  const MONEY = /(?:US\$|A\$|C\$|HK\$|\$|£|€|₩|AED\s?|USD\s?|GBP\s?|EUR\s?|CAD\s?|AUD\s?)\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:AED|USD|GBP|EUR|CAD|AUD)\b/g;
  const visible = el => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || e.hidden) return false; } return el.getClientRects().length > 0; };
  // Leaf elements whose own text has a price.
  const leaves = [...document.body.querySelectorAll('*')].filter(e => {
    if (!visible(e) || e.closest('script,style,noscript,select,option')) return false;
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join(' ');
    return /\d/.test(own) && new RegExp(MONEY.source).test(e.innerText) && [...e.children].every(c => !new RegExp(MONEY.source).test(c.innerText));
  });
  const cards = new Map();
  for (const leaf of leaves) {
    // The card: the closest ancestor with a heading or name, kept small.
    let card = leaf;
    for (let up = leaf.parentElement; up && up !== document.body; up = up.parentElement) {
      const t = up.innerText || '';
      if (t.length > 900) break;
      card = up;
      if (up.querySelector('h1,h2,h3,h4,h5,h6,strong,b,[class*=title],[class*=name]') && t.length > 25) break;
    }
    if (!cards.has(card)) cards.set(card, []);
    cards.get(card).push(leaf);
  }
  const out = [];
  for (const [card, ls] of cards) {
    const head = card.querySelector('h1,h2,h3,h4,h5,h6,[class*=title],[class*=name],strong,b');
    let title = head ? head.innerText.trim().replace(/\s+/g, ' ') : '';
    if (new RegExp(MONEY.source).test(title)) title = '';   // a price is not a title
    const text = card.innerText.replace(/\s+/g, ' ').trim();
    const prices = ls.map(l => ({ text: l.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), amounts: (l.innerText.match(MONEY) || []).map(s => s.trim()) }));
    out.push({ title: title.slice(0, 80), prices, cardText: text.slice(0, 400) });
  }
  return out;
}

// Runs in the page: the option controls that change prices (terms, durations, plans).
function findOptions() {
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const re = /^\s*(\d{1,2})\s*(months?|mo|years?|yrs?)\s*$|^\s*(monthly|yearly|annual(ly)?|quarterly|one[- ]off|weekly)\s*$/i;
  const els = [...document.querySelectorAll('button,[role=tab],label,a,[data-term],[data-t],[data-period],[data-plan]')]
    .filter(e => visible(e) && (re.test(e.innerText || '') || e.dataset.term || e.dataset.period));
  const seen = new Set(); const opts = [];
  els.forEach((e, i) => { const key = (e.innerText || e.dataset.term || '').trim().toLowerCase(); if (!key || seen.has(key)) return; seen.add(key); e.setAttribute('data-pf-opt', String(i)); opts.push({ id: String(i), label: (e.innerText || e.dataset.term).trim() }); });
  return opts;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route('**/*', r => (r.request().method() === 'GET' ? r.continue() : r.abort()));   // read-only
  const page = await ctx.newPage();
  const goto = async u => { try { await page.goto(u, { waitUntil: 'networkidle', timeout: 30000 }); } catch { await page.goto(u, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(2500); } };
  const settle = async () => { await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } scrollTo(0, 0); }); await page.waitForTimeout(600); };

  // Pages: home + everything linked from it and from those pages.
  const seen = new Set([origin + '/']); const queue = [origin + '/'];
  for (let depth = 0; depth < 2; depth++) for (const u of [...queue]) {
    if (seen.size >= MAX) break;
    await goto(u);
    // Normal links, plus buttons that navigate with a script (onclick="location.href='...'") or data-href.
    const hrefs = await page.evaluate(() => {
      const out = [...document.querySelectorAll('a[href]')].map(a => a.href);
      for (const el of document.querySelectorAll('[onclick],[data-href],[data-url],[data-link]')) {
        const src = (el.getAttribute('onclick') || '') + ' ' + (el.dataset.href || el.dataset.url || el.dataset.link || '');
        for (const m of src.matchAll(/(?:location(?:\.href)?\s*=\s*|^|\s)['"]?((?:https?:\/\/|\/)[^'"\s)]+)/g)) { try { out.push(new URL(m[1].replace(/&amp;/g, '&'), location.href).href); } catch {} }
      }
      for (const m of document.documentElement.innerHTML.matchAll(/location\.href\s*=\s*["']([^"']+)["']/g)) { try { out.push(new URL(m[1], location.href).href); } catch {} }
      return out.map(h => h.split('#')[0].replace(/\/$/, ''));
    });
    for (const h of hrefs) {
      try { const x = new URL(h); if (x.hostname.replace(/^www\./, '') !== host || SKIP.test(x.pathname)) continue; } catch { continue; }
      if (!seen.has(h) && seen.size < MAX) { seen.add(h); queue.push(h); }
    }
  }
  let pages = [...seen];
  if (ONLY.length) pages = pages.filter(u => ONLY.some(o => u.toLowerCase().includes(o)));
  console.log(`Reading prices on ${pages.length} pages...`);

  const results = [];
  for (const u of pages) {
    try {
      await goto(u); await settle();
      const opts = await page.evaluate(findOptions);
      const states = [{ option: '(as the page opens)', cards: await page.evaluate(readCards) }];
      for (const o of opts) {
        await page.locator(`[data-pf-opt="${o.id}"]`).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(700);
        states.push({ option: o.label, cards: await page.evaluate(readCards) });
      }
      const withPrices = states.filter(s => s.cards.length);
      if (withPrices.length) results.push({ page: u.replace(origin, '') || '/', options: opts.map(o => o.label), states: withPrices });
    } catch (e) { results.push({ page: u.replace(origin, '') || '/', error: String(e.message).slice(0, 150) }); }
  }
  await browser.close();

  // Flatten to rows; drop states identical to the opening state.
  const rows = [];
  for (const r of results) {
    if (r.error) continue;
    const base = JSON.stringify(r.states[0].cards);
    for (const s of r.states) {
      if (s.option !== '(as the page opens)' && JSON.stringify(s.cards) === base && r.states.length > 1) continue;
      for (const c of s.cards) for (const p of c.prices) rows.push({ page: r.page, option: s.option, item: c.title, shown: p.text, amounts: p.amounts.join(' | ') });
    }
  }
  fs.writeFileSync(path.join(OUT, 'prices.json'), JSON.stringify({ site: origin, checked: new Date().toISOString(), pages: results }, null, 1));
  const csv = [['Page', 'Option selected', 'Item', 'Shown on the page', 'Amounts']].concat(rows.map(r => [r.page, r.option, r.item, r.shown, r.amounts]))
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(path.join(OUT, 'prices.csv'), csv);
  console.log(`Found ${rows.length} prices on ${results.filter(r => !r.error).length} pages. Saved to ${OUT}/prices.csv and prices.json\n`);
  let last = '';
  for (const r of rows) { const k = r.page + ' | ' + r.option; if (k !== last) { console.log(`\n${r.page}  [${r.option}]`); last = k; } console.log(`   ${(r.item || '(no name)').padEnd(34)} ${r.shown}`); }
})();
