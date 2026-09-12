/**
 * Generates the PrepTracker mobile redesign mockups.
 *
 * Every artboard is a static Design Component (`.dc.html`) built from the
 * tokens in docs/UI_DESIGN_SPEC.md, so the mockups and the spec cannot drift.
 * Run `node docs/mockups/build-artboards.mjs` to regenerate the files next to
 * this script; they are seeded into the "PrepTracker Mobile Redesign" canvas.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------- tokens */
const T = {
  bg: '#fafcff', card: '#ffffff', fg: '#0c121a', muted: '#626975', border: '#dee1e7', sec: '#eff2f7',
  primary: '#2966cc', ptint: '#e6f3ff',
  success: '#067132', sfill: '#1c8742', stint: '#e0fae4',
  warn: '#9a5b00', wtint: '#ffefcd',
  rest: '#007475', rfill: '#008080', rtint: '#d8faf9',
  miss: '#b7191c', mtint: '#ffebe7',
  inb: '#8e929a',
};

/* ---------------------------------------------------------------- icons */
const svg = (paths, size = 20, sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const I = {
  check: (s = 20) => svg('<path d="M20 6 9 17l-5-5"></path>', s, 2.5),
  checkCircle: (s = 20) => svg('<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>', s),
  circle: (s = 20) => svg('<circle cx="12" cy="12" r="9"></circle>', s),
  play: (s = 20) => svg('<circle cx="12" cy="12" r="10"></circle><path d="m10 8 6 4-6 4Z"></path>', s),
  alert: (s = 20) => svg('<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4M12 16h.01"></path>', s),
  chevR: (s = 20) => svg('<path d="m9 18 6-6-6-6"></path>', s),
  chevL: (s = 20) => svg('<path d="m15 18-6-6 6-6"></path>', s),
  chevD: (s = 20) => svg('<path d="m6 9 6 6 6-6"></path>', s),
  plus: (s = 20) => svg('<path d="M12 5v14M5 12h14"></path>', s),
  undo: (s = 20) => svg('<path d="M9 14 4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>', s),
  clock: (s = 20) => svg('<circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>', s),
  droplet: (s = 20) => svg('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>', s),
  dumbbell: (s = 20) => svg('<path d="M14.4 14.4 9.6 9.6"></path><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"></path><path d="m21.5 21.5-1.4-1.4"></path><path d="M3.9 3.9 2.5 2.5"></path><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"></path>', s),
  moon: (s = 20) => svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>', s),
  calendar: (s = 20) => svg('<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>', s),
  calendarCheck: (s = 20) => svg('<path d="M8 2v4M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path><path d="m9 16 2 2 4-4"></path>', s),
  chef: (s = 20) => svg('<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"></path><path d="M6 17h12"></path>', s),
  cart: (s = 20) => svg('<circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>', s),
  more: (s = 20) => svg('<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>', s),
  moreV: (s = 20) => svg('<circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>', s),
  pencil: (s = 20) => svg('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path>', s),
  x: (s = 20) => svg('<path d="M18 6 6 18M6 6l12 12"></path>', s),
  snow: (s = 20) => svg('<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"></path>', s),
  fridge: (s = 20) => svg('<rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M5 10h14M9 6v2M9 14v3"></path>', s),
  bell: (s = 20) => svg('<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>', s),
  search: (s = 20) => svg('<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>', s),
  note: (s = 20) => svg('<path d="M12 20h9"></path><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"></path>', s),
  scale: (s = 20) => svg('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>', s),
  minusCircle: (s = 20) => svg('<circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path>', s),
  sun: (s = 20) => svg('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>', s),
  monitor: (s = 20) => svg('<rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8M12 17v4"></path>', s),
  wifiOff: (s = 20) => svg('<path d="M12 20h.01"></path><path d="M8.5 16.429a5 5 0 0 1 7 0"></path><path d="M5 12.859a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.859a10 10 0 0 0-2.007-1.523"></path><path d="M2 8.82a15 15 0 0 1 4.177-2.643"></path><path d="M22 8.82a15 15 0 0 0-11.288-3.764"></path><path d="m2 2 20 20"></path>', s),
};

/* ---------------------------------------------------------------- CSS */
const CSS = `
  body { margin: 0; background: ${T.bg}; color: ${T.fg}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif; -webkit-font-smoothing: antialiased; font-size: 15px; line-height: 22px; }
  a { color: ${T.primary}; } a:hover { color: #1f4f9f; }
  * { box-sizing: border-box; }
  .num { font-variant-numeric: tabular-nums; }
  .screen { width: 390px; background: ${T.bg}; position: relative; display: flex; flex-direction: column; overflow: hidden; }
  .body { display: flex; flex-direction: column; gap: 12px; padding: 0 16px 24px; }
  .hdr { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 16px 12px; }
  .h1 { font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
  .sub { font-size: 13px; line-height: 18px; color: ${T.muted}; margin: 0; }
  .eyebrow { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.muted}; }
  .section { font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.muted}; display: flex; align-items: center; justify-content: space-between; padding: 12px 0 0; }
  .card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .row { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 16px; border-top: 1px solid ${T.border}; }
  .row:first-child { border-top: 0; }
  .grow { flex: 1; min-width: 0; }
  .title { font-size: 17px; line-height: 22px; font-weight: 600; }
  .secondary { font-size: 13px; line-height: 18px; color: ${T.muted}; }
  .metric { font-size: 28px; line-height: 32px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 16px; border-radius: 10px; font-size: 16px; font-weight: 600; border: 1px solid transparent; }
  .btn.hero { height: 52px; width: 100%; background: ${T.sfill}; color: #fff; }
  .btn.primary { background: ${T.primary}; color: #fff; }
  .btn.tonal { background: ${T.ptint}; color: ${T.primary}; height: 52px; }
  .btn.outline { background: ${T.card}; border-color: ${T.border}; color: ${T.fg}; height: 44px; }
  .btn.text { background: transparent; color: ${T.primary}; height: 44px; padding: 0 8px; }
  .btn.danger { background: #cc2827; color: #fff; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid ${T.border}; background: ${T.card}; font-size: 15px; font-weight: 500; }
  .chip.on { background: ${T.ptint}; border-color: ${T.primary}; color: ${T.primary}; }
  .pill { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 16px; }
  .pill.success { background: ${T.stint}; color: ${T.success}; }
  .pill.training { background: ${T.ptint}; color: ${T.primary}; }
  .pill.rest { background: ${T.rtint}; color: ${T.rest}; }
  .pill.warn { background: ${T.wtint}; color: ${T.warn}; }
  .pill.neutral { background: ${T.sec}; color: ${T.muted}; }
  .seg { display: flex; background: ${T.sec}; border-radius: 999px; padding: 4px; height: 48px; gap: 4px; }
  .seg > div { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 999px; font-size: 15px; font-weight: 600; color: ${T.muted}; }
  .seg > div.on { background: ${T.primary}; color: #fff; }
  .seg > div.on.rest { background: ${T.rfill}; }
  .seg.small { height: 36px; padding: 3px; }
  .seg.small > div { font-size: 13px; }
  .seg.small > div.on { background: ${T.card}; color: ${T.fg}; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
  .bar { height: 6px; border-radius: 999px; background: ${T.sec}; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: ${T.primary}; border-radius: 999px; }
  .bar.thin { height: 4px; }
  .nav { display: flex; align-items: stretch; height: 64px; border-top: 1px solid ${T.border}; background: ${T.card}; }
  .nav > div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 11px; font-weight: 500; color: ${T.muted}; }
  .nav > div.on { color: ${T.primary}; }
  .nav > div.on span.ind { position: absolute; width: 20px; height: 3px; border-radius: 999px; background: ${T.primary}; top: 0; }
  .nav > div { position: relative; }
  .pinned { position: absolute; left: 0; right: 0; bottom: 0; }
  .input { display: flex; align-items: center; justify-content: space-between; height: 48px; border: 1px solid ${T.inb}; border-radius: 10px; padding: 0 14px; background: ${T.card}; font-size: 16px; }
  .label { font-size: 13px; line-height: 16px; font-weight: 500; }
  .hint { font-size: 13px; line-height: 18px; color: ${T.muted}; }
  .overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.55); }
  .sheet { position: absolute; left: 0; right: 0; bottom: 0; background: ${T.card}; border-radius: 20px 20px 0 0; border: 1px solid ${T.border}; display: flex; flex-direction: column; }
  .sheet-hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid ${T.border}; }
  .sheet-bd { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
  .sheet-ft { display: flex; gap: 8px; padding: 12px 16px 20px; border-top: 1px solid ${T.border}; }
  .sheet-ft .btn { flex: 1; }
  .ing { display: flex; align-items: baseline; gap: 12px; padding: 6px 0; }
  .ing .amt { width: 64px; flex: none; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
  .step { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-top: 1px solid ${T.border}; }
  .step .n { width: 24px; height: 24px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex: none; }
  .tile { flex: 1; background: ${T.card}; border: 1px solid ${T.border}; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 2px; }
  .cb { width: 28px; height: 28px; border-radius: 8px; border: 2px solid ${T.inb}; flex: none; display: flex; align-items: center; justify-content: center; }
  .cb.on { background: ${T.sfill}; border-color: ${T.sfill}; color: #fff; }
  .cb.big { width: 44px; height: 44px; border-radius: 999px; }
  .banner { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: ${T.wtint}; color: ${T.warn}; font-size: 13px; font-weight: 500; }
`;

/* --------------------------------------------------------------- helpers */
const doc = (title, height, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${CSS}</style>
</helmet>
<div class="screen" style="height: ${height}px;">
${body}
</div>
</x-dc>
</body>
</html>
`;

const header = (title, sub, right = '', back = false) => `
  <div class="hdr">
    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
      ${back ? `<div style="width: 44px; height: 44px; margin-left: -12px; display: flex; align-items: center; justify-content: center; color: ${T.muted};">${I.chevL(24)}</div>` : ''}
      <div style="min-width: 0;">
        <h1 class="h1">${title}</h1>
        ${sub ? `<p class="sub">${sub}</p>` : ''}
      </div>
    </div>
    ${right}
  </div>`;

const nav = (active, pinned = true) => {
  const items = [
    ['Today', I.calendarCheck(24)], ['Plan', I.calendar(24)], ['Prep', I.chef(24)], ['Groceries', I.cart(24)], ['More', I.more(24)],
  ];
  return `<div class="nav ${pinned ? 'pinned' : ''}">${items
    .map(([l, ic]) => `<div class="${l === active ? 'on' : ''}">${l === active ? '<span class="ind"></span>' : ''}${ic}<span>${l}</span></div>`)
    .join('')}</div>`;
};

const seg = (a, b, activeIdx = 0, restStyle = false) => `
  <div class="seg" role="radiogroup" aria-label="Day type">
    <div class="${activeIdx === 0 ? 'on' : ''}">${activeIdx === 0 ? I.check(16) : ''}${a}</div>
    <div class="${activeIdx === 1 ? `on ${restStyle ? 'rest' : ''}` : ''}">${activeIdx === 1 ? I.check(16) : ''}${b}</div>
  </div>`;

const stat = (label, value, pct, color = T.primary) => `
  <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
    <span class="secondary" style="font-weight: 500; white-space: nowrap;">${label}</span>
    <span class="num" style="font-size: 17px; line-height: 22px; font-weight: 600; white-space: nowrap;">${value}</span>
    <div class="bar thin" style="margin-top: 2px;"><i style="width: ${pct}%; background: ${color};"></i></div>
  </div>`;

const ing = (amt, name, right = '', done = false) => `
  <div class="ing">
    ${done ? `<span style="color: ${T.success}; flex: none; display: flex;">${I.check(16)}</span>` : ''}
    <span class="amt">${amt}</span>
    <span class="grow">${name}</span>
    ${right}
  </div>`;

const mealRow = (state, name, line, right = I.chevR(20)) => {
  const icons = {
    done: `<span style="color: ${T.success}; display: flex;">${I.checkCircle(22)}</span>`,
    next: `<span style="color: ${T.primary}; display: flex;">${I.play(22)}</span>`,
    pending: `<span style="color: ${T.muted}; display: flex;">${I.circle(22)}</span>`,
    overdue: `<span style="color: ${T.warn}; display: flex;">${I.alert(22)}</span>`,
    skipped: `<span style="color: ${T.muted}; display: flex;">${I.minusCircle(22)}</span>`,
  };
  return `
  <div class="row">
    ${icons[state]}
    <div class="grow">
      <div class="title" style="display: flex; align-items: center; gap: 8px;">${name}</div>
      <div class="secondary num">${line}</div>
    </div>
    <span style="color: ${T.muted}; display: flex;">${right}</span>
  </div>`;
};

const topOfToday = (dayIdx = 0) => `
  ${header('Today', 'Fri 11 Sep', `<div class="btn text" style="margin-right: -8px;">This week ${I.chevR(18)}</div>`)}
  <div class="body">
    ${seg('Training', 'Rest', dayIdx, true)}
    <div style="display: flex; align-items: center; gap: 8px; min-height: 28px;">
      <span style="color: ${T.primary}; display: flex;">${dayIdx === 0 ? I.dumbbell(18) : I.moon(18)}</span>
      <span class="grow" style="font-size: 15px; font-weight: 500;">${dayIdx === 0 ? 'Chest + Triceps · 7:30 PM' : 'Rest day · no training'}</span>
      ${dayIdx === 0 ? `<span style="color: ${T.primary}; font-weight: 600; font-size: 15px;">Edit</span>` : ''}
    </div>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 4px 0;">
      ${stat('Meals', '2 / 5', 40)}
      ${stat('Water', '1.5 / 4 L', 37)}
      ${stat('Supplements', '3 / 7', 43)}
    </div>`;

const heroCard = () => `
    <div class="card" style="padding: 16px; border: 2px solid rgba(41,102,204,0.35); display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="eyebrow" style="color: ${T.primary};">Next meal · in 1 h 12 min</span>
        <span class="num" style="font-size: 17px; font-weight: 600;">5:30 PM</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="h1">Meal 3</span>
        <span class="pill neutral">Pre-workout</span>
      </div>
      <div style="display: flex; flex-direction: column;">
        ${ing('70 g', 'Oats')}
        ${ing('50 g', 'IsoWhey')}
        ${ing('100 g', 'Frozen berries', `<span style="color: ${T.primary}; font-weight: 600; font-size: 13px;">Swap</span>`)}
        ${ing('16 g', 'Peanut butter', `<span style="color: ${T.primary}; font-weight: 600; font-size: 13px;">Swap</span>`)}
      </div>
      <div class="hint" style="display: flex; align-items: center; gap: 6px;">${I.dumbbell(14)} Training portions</div>
      <div class="btn hero">${I.check(20)} Mark eaten</div>
    </div>`;

const waterCard = (undo = true) => `
    <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span class="eyebrow" style="display: flex; align-items: center; gap: 6px;">${I.droplet(14)} Water</span>
        <span class="metric">1.5 <span style="color: ${T.muted}; font-weight: 500; font-size: 17px;">/ 4.0 L</span></span>
      </div>
      <div class="bar"><i style="width: 37%;"></i></div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="secondary">2.5 L to go</span>
        ${undo ? `<span style="color: ${T.primary}; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 4px;">${I.undo(14)} Undo 250 mL</span>` : ''}
      </div>
      <div style="display: flex; gap: 8px;">
        <div class="btn tonal" style="flex: 1;">${I.plus(18)} 250 mL</div>
        <div class="btn tonal" style="flex: 1;">${I.plus(18)} 500 mL</div>
        <div class="btn outline" style="width: 52px; height: 52px; padding: 0; color: ${T.muted};">${I.moreV(20)}</div>
      </div>
    </div>`;

/* --------------------------------------------------------------- screens */

// 1. Today — what you see at open
const Main = doc('Today', 844, `
  ${topOfToday(0)}
    ${heroCard()}
    ${waterCard()}
  </div>
  ${nav('Today')}
`);

// 2. Today — the whole page scrolled
const TodayFull = doc('Today (full page)', 1640, `
  ${topOfToday(0)}
    ${heroCard()}
    ${waterCard(false)}
    <div class="section">Meals <span class="num" style="text-transform: none; letter-spacing: 0; font-weight: 500;">2 of 5</span></div>
    <div class="card">
      ${mealRow('done', 'Meal 1', '8:00 AM → 8:05 AM')}
      ${mealRow('done', 'Meal 2', '12:30 PM → 12:42 PM · 12 min late')}
      ${mealRow('next', 'Meal 3 <span class="pill training">Next</span>', '5:30 PM · Pre-workout')}
      ${mealRow('pending', 'Meal 4', '8:30 PM · After training')}
      ${mealRow('pending', 'Meal 5', '10:30 PM')}
    </div>
    <div class="section">Supplements <span class="num" style="text-transform: none; letter-spacing: 0; font-weight: 500;">4 of 7</span></div>
    <div class="card">
      <div class="row" style="min-height: 48px;">
        <div class="grow title" style="font-size: 15px;">Morning</div>
        <span style="color: ${T.success}; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px;">All taken ${I.check(14)}</span>
        <span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span>
      </div>
      <div class="row" style="min-height: 48px; background: ${T.bg};">
        <div class="grow title" style="font-size: 15px;">Pre-workout</div>
        <span class="secondary">1 left</span>
        <span style="color: ${T.primary}; font-weight: 600; font-size: 13px;">Take all</span>
        <span style="color: ${T.muted}; display: flex;">${I.chevD(20)}</span>
      </div>
      <div class="row" style="min-height: 48px; padding-left: 24px;">
        <span class="cb"></span>
        <div class="grow">
          <div style="font-weight: 500;">Creatine monohydrate</div>
          <div class="secondary num">5 g · 5:00 PM</div>
        </div>
      </div>
      <div class="row" style="min-height: 48px;">
        <div class="grow title" style="font-size: 15px;">Before bed</div>
        <span class="secondary">2 left</span>
        <span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span>
      </div>
    </div>
    <div class="card row" style="min-height: 44px; border-top: 0;">
      <span style="color: ${T.warn}; display: flex;">${I.bell(18)}</span>
      <div class="grow" style="font-size: 13px;">Prep day is today · 14 items left to buy <span class="secondary">· and 1 more</span></div>
      <span style="color: ${T.muted}; display: flex;">${I.chevR(18)}</span>
    </div>
    <div class="row" style="min-height: 44px; border-top: 0; padding: 0; color: ${T.primary}; font-weight: 600;">
      ${I.note(18)} Add a note about today
    </div>
  </div>
  ${nav('Today', false)}
`);

// 3. Meal detail — expanded meal + time correction sheet
const MealDetail = doc('Meal detail', 844, `
  ${header('Today', 'Fri 11 Sep', `<div class="btn text" style="margin-right: -8px;">This week ${I.chevR(18)}</div>`)}
  <div class="body">
    <div class="section">Meals <span class="num" style="text-transform: none; letter-spacing: 0; font-weight: 500;">2 of 5</span></div>
    <div class="card">
      ${mealRow('done', 'Meal 1', '8:00 AM → 8:05 AM')}
      <div class="row" style="align-items: flex-start; flex-direction: column; gap: 8px; background: ${T.bg};">
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
          <span style="color: ${T.success}; display: flex;">${I.checkCircle(22)}</span>
          <div class="grow">
            <div class="title">Meal 2</div>
            <div class="secondary num">Planned 12:30 PM · 12 min late</div>
          </div>
          <span class="pill success" style="height: 32px; padding: 0 12px; font-size: 13px;">${I.check(14)} Eaten 12:42 PM ${I.pencil(14)}</span>
        </div>
        <div style="width: 100%; border-top: 1px solid ${T.border}; padding-top: 6px;">
          ${ing('225 g', 'White rice <span class="secondary">(cooked)</span>', '', true)}
          ${ing('175 g', 'Chicken breast', `<span style="color: ${T.primary}; font-weight: 600; font-size: 13px;">Swap</span>`, true)}
          ${ing('100 g', 'Frozen vegetables', '', true)}
          ${ing('1', 'Orange', '', true)}
          ${ing('¼ tsp', 'Pink Himalayan salt <span class="secondary">· optional</span>', '', true)}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px 12px; width: 100%; border-top: 1px solid ${T.border}; padding-top: 6px; color: ${T.primary}; font-weight: 600; font-size: 15px;">
          <span style="height: 40px; display: flex; align-items: center;">Edit amounts</span>
          <span style="height: 40px; display: flex; align-items: center;">Note</span>
          <span style="height: 40px; display: flex; align-items: center;">Reschedule</span>
          <span style="height: 40px; display: flex; align-items: center; color: ${T.muted};">Undo eaten</span>
        </div>
      </div>
      ${mealRow('next', 'Meal 3 <span class="pill training">Next</span>', '5:30 PM · Pre-workout')}
    </div>
  </div>
  <div class="overlay"></div>
  <div class="sheet">
    <div class="sheet-hd">
      <div>
        <div class="title">When did you eat Meal 2?</div>
        <div class="hint">Planned for 12:30 PM. Your planned time stays as it is.</div>
      </div>
      <span style="color: ${T.muted}; display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; margin: -10px -10px 0 0;">${I.x(20)}</span>
    </div>
    <div class="sheet-bd">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span class="label">Time eaten</span>
        <div class="input num">12:42 PM <span style="color: ${T.muted}; display: flex;">${I.clock(18)}</span></div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <span class="chip">−15 min</span><span class="chip">−30 min</span><span class="chip">As planned · 12:30</span><span class="chip">Now</span>
      </div>
    </div>
    <div class="sheet-ft">
      <div class="btn outline" style="height: 48px;">Cancel</div>
      <div class="btn primary">Save</div>
    </div>
  </div>
`);

// 4. Day state — switching Training → Rest with logged meals
const DayState = doc('Training or rest day', 844, `
  ${topOfToday(1)}
    ${heroCard()}
  </div>
  <div class="overlay"></div>
  <div class="sheet">
    <div class="sheet-hd">
      <div>
        <div class="title">Switch to a rest day?</div>
        <div class="hint">2 meals are already logged as eaten. Rest-day portions will apply to the 3 remaining meals. Today only; your weekly schedule is unchanged.</div>
      </div>
    </div>
    <div class="sheet-bd" style="gap: 8px;">
      <div class="btn primary" style="width: 100%;">Keep eaten meals as logged</div>
      <div class="btn outline" style="width: 100%; height: 48px;">Change all 5 meals to rest portions</div>
      <div class="btn text" style="width: 100%;">Cancel</div>
    </div>
    <div style="height: 12px;"></div>
  </div>
`);

// 5. Workout selector sheet
const Workout = doc('Workout selector', 844, `
  ${topOfToday(0)}
  </div>
  <div class="overlay"></div>
  <div class="sheet" style="top: 96px;">
    <div class="sheet-hd">
      <div>
        <div class="title">Today's workout</div>
        <div class="hint">Saved against this date only.</div>
      </div>
      <span style="color: ${T.muted}; display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; margin: -10px -10px 0 0;">${I.x(20)}</span>
    </div>
    <div class="sheet-bd" style="flex: 1; overflow: hidden;">
      <div>
        <div class="eyebrow" style="margin-bottom: 8px;">Presets</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <span class="chip on">${I.check(16)} Push</span><span class="chip">Pull</span><span class="chip">Legs</span><span class="chip">Upper</span><span class="chip">Lower</span><span class="chip">Full body</span>
        </div>
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom: 8px;">Body parts</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <span class="chip on">${I.check(16)} Chest</span><span class="chip on">${I.check(16)} Shoulders</span><span class="chip on">${I.check(16)} Triceps</span><span class="chip">Back</span><span class="chip">Biceps</span><span class="chip">Quads</span><span class="chip">Hamstrings</span><span class="chip">Glutes</span><span class="chip">Calves</span><span class="chip">Core</span><span class="chip" style="color: ${T.primary};">${I.plus(16)} Add</span>
        </div>
      </div>
      <div class="card" style="padding: 12px 16px; display: flex; align-items: center; gap: 10px;">
        <span style="color: ${T.primary}; display: flex;">${I.dumbbell(20)}</span>
        <span class="title" style="font-size: 15px;">Chest + Shoulders + Triceps</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; min-height: 44px;">
        <span style="font-weight: 500;">More: session name, training time <span class="secondary num">7:30 PM</span></span>
        <span style="color: ${T.muted}; display: flex;">${I.chevD(20)}</span>
      </div>
    </div>
    <div class="sheet-ft">
      <div class="btn outline" style="height: 48px;">Cancel</div>
      <div class="btn primary">Use Push</div>
    </div>
  </div>
`);

// 6. Week view
const weekRow = (day, date, type, workout, stats, score, extra = '', today = false) => `
  <div class="row" style="align-items: flex-start; ${today ? `background: ${T.ptint}33;` : ''}">
    <div class="num" style="width: 44px; flex: none; text-align: center;">
      <div class="secondary" style="font-weight: 600;">${day}</div>
      <div style="font-size: 20px; font-weight: 700; line-height: 24px;">${date}</div>
    </div>
    <div class="grow">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="pill ${type === 'Training' ? 'training' : 'rest'}">${type}</span>
        ${workout ? `<span style="font-weight: 500;">${workout}</span>` : ''}
        ${today ? `<span class="pill neutral">Today</span>` : ''}
      </div>
      ${stats ? `<div class="secondary num" style="margin-top: 2px;">${stats}</div>` : ''}
      ${extra}
    </div>
    ${score ? `<span class="num" style="font-size: 17px; font-weight: 700; color: ${score === '100%' ? T.success : score === '85%' ? T.primary : T.fg};">${score}</span>` : ''}
  </div>`;

const WeekView = doc('This week', 880, `
  ${header('This week', 'Mon 7 – Sun 13 Sep', `<div style="display: flex; gap: 4px; color: ${T.muted};"><span style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">${I.chevL(22)}</span><span style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">${I.chevR(22)}</span></div>`, true)}
  <div class="body">
    <div style="font-size: 15px; font-weight: 500;">4 of 5 days on plan <span class="secondary">· 3.6 L average water</span></div>
    <div class="card">
      ${weekRow('MON', '7', 'Training', 'Chest + Triceps', '5/5 meals · 4.0 L · 7/7 supplements', '100%')}
      ${weekRow('TUE', '8', 'Training', 'Back + Biceps', '4/5 meals · 3.5 L · 7/7 supplements', '85%', `
        <div class="num" style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding: 8px 12px; background: ${T.bg}; border-radius: 10px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between;"><span>Meal 1</span><span><span class="secondary">planned 8:00 · eaten</span> 8:05</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Meal 2</span><span><span class="secondary">planned 12:30 · eaten</span> 12:52</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Meal 3</span><span><span class="secondary">planned 5:30 · eaten</span> 5:33</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Meal 4</span><span><span class="secondary">planned 8:30 ·</span> <span style="color: ${T.muted};">skipped</span></span></div>
          <div style="display: flex; justify-content: space-between;"><span>Meal 5</span><span><span class="secondary">planned 10:30 · eaten</span> 10:41</span></div>
        </div>`)}
      ${weekRow('WED', '9', 'Rest', '', '5/5 meals · 4.2 L · 5/5 supplements', '100%')}
      ${weekRow('THU', '10', 'Training', 'Legs', '5/5 meals · 3.8 L · 7/7 supplements', '97%')}
      ${weekRow('FRI', '11', 'Training', 'Shoulders', '2/5 meals so far · 1.5 L', '', '', true)}
      ${weekRow('SAT', '12', 'Rest', '', '<span class="secondary">Planned</span>', '')}
      ${weekRow('SUN', '13', 'Training', 'Push', '<span class="secondary">Planned</span>', '')}
    </div>
  </div>
  ${nav('Today', false)}
`);

// 7. Groceries landing
const Groceries = doc('Groceries', 844, `
  ${header('Groceries', '', `<div class="btn text" style="margin-right: -8px;">${I.plus(18)} New list</div>`)}
  <div class="body">
    <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="title">Week of 7 Sep</span>
        <span class="pill training">Active</span>
      </div>
      <div>
        <div class="metric">12 <span style="font-size: 17px; font-weight: 500; color: ${T.muted};">items remaining</span></div>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
          <div class="bar" style="flex: 1;"><i style="width: 14%; background: ${T.sfill};"></i></div>
          <span class="secondary num">2 of 14</span>
        </div>
      </div>
      <div class="btn primary" style="height: 52px; width: 100%;">${I.cart(20)} Shop</div>
      <div style="display: flex; gap: 8px;">
        <div class="btn outline" style="flex: 1;">Review list</div>
        <div class="btn outline" style="flex: 1;">${I.plus(18)} Add item</div>
      </div>
    </div>
    <div class="section">Past lists</div>
    <div class="card">
      <div class="row">
        <div class="grow"><div style="font-weight: 500;">Week of 31 Aug</div><div class="secondary num">Done · 15 items</div></div>
        <span class="pill success">${I.check(12)} Done</span>
        <span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span>
      </div>
      <div class="row">
        <div class="grow"><div style="font-weight: 500;">Week of 24 Aug</div><div class="secondary num">Done · 14 items</div></div>
        <span class="pill success">${I.check(12)} Done</span>
        <span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span>
      </div>
    </div>
  </div>
  ${nav('Groceries')}
`);

// 8. Shopping Mode
const shopRow = (name, qty, on = false, undo = false) => `
  <div class="row" style="min-height: 64px; ${on ? `background: ${T.stint}66;` : ''}">
    <span class="cb big ${on ? 'on' : ''}">${on ? I.check(24) : ''}</span>
    <div class="grow">
      <div style="font-size: 16px; font-weight: 500; ${on ? `color: ${T.muted}; text-decoration: line-through;` : ''}">${name}</div>
      <div class="secondary num">${qty}</div>
    </div>
    ${undo ? `<span style="color: ${T.primary}; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 4px;">${I.undo(14)} Undo</span>` : ''}
  </div>`;

const ShoppingMode = doc('Shopping Mode', 844, `
  ${header('Shopping', 'Week of 7 Sep', `<div style="display: flex; gap: 4px;"><span class="btn outline" style="width: 44px; padding: 0; color: ${T.muted};">${I.search(20)}</span><span class="btn outline" style="width: 44px; padding: 0;">${I.plus(20)}</span></div>`, true)}
  <div class="body" style="gap: 8px;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <div class="metric">12 <span style="font-size: 17px; font-weight: 500; color: ${T.muted};">items remaining</span></div>
      <div class="seg small" style="width: 160px;"><div class="on">Remaining</div><div>All</div></div>
    </div>
    <div class="section" style="padding-top: 4px;">Produce</div>
    <div class="card">
      ${shopRow('Avocados', '4')}
      ${shopRow('Oranges', '7')}
      ${shopRow('Frozen vegetables', '2.1 kg · 2 packs of 1 kg')}
    </div>
    <div class="section" style="padding-top: 4px;">Protein</div>
    <div class="card">
      ${shopRow('Chicken breast', '3.3 kg · 4 packs of 1 kg')}
      ${shopRow('Extra lean beef', '1.6 kg')}
    </div>
    <div class="section" style="padding-top: 4px;">Carbs</div>
    <div class="card">
      ${shopRow('Rice', '1.25 kg')}
      ${shopRow('Bagels', '12 · 2 packs of 6')}
      ${shopRow('Oats', '460 g', true, true)}
    </div>
  </div>
  ${nav('Groceries')}
`);

// 9. Prep Mode
const step = (n, label, value, state) => {
  const colors = { done: [T.stint, T.success], active: [T.primary, '#fff'], todo: [T.sec, T.muted] };
  const [bg, fg] = colors[state];
  return `
  <div class="step" style="${state === 'todo' ? `color: ${T.muted};` : ''}">
    <span class="n" style="background: ${bg}; color: ${fg};">${state === 'done' ? I.check(14) : n}</span>
    <div class="grow" style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: ${state === 'active' ? 600 : 500};">${label}</span>
        ${state === 'done' ? `<span class="num" style="font-weight: 600;">${value}</span>` : ''}
      </div>
      ${state === 'active' ? value : ''}
    </div>
  </div>`;
};

const PrepMode = doc('Prep Mode', 1000, `
  ${header('Sunday prep', '7 days of food', `<span class="btn outline" style="width: 44px; padding: 0; color: ${T.muted};">${I.moreV(20)}</span>`, true)}
  <div class="body">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between;"><span style="font-weight: 600;">Batch 1 of 4</span><span class="secondary">Chicken · Steak · Rice · Vegetables</span></div>
      <div style="display: flex; gap: 6px;">
        <div class="bar thin" style="flex: 1;"><i style="width: 60%;"></i></div>
        <div class="bar thin" style="flex: 1;"></div>
        <div class="bar thin" style="flex: 1;"></div>
        <div class="bar thin" style="flex: 1;"></div>
      </div>
    </div>
    <div class="card" style="padding: 16px; display: flex; flex-direction: column;">
      <div class="h1">Chicken</div>
      <div class="secondary num" style="margin-bottom: 8px;">Need 2.45 kg cooked · 14 × 175 g</div>
      ${step(1, 'Weigh raw', '3.10 kg', 'done')}
      ${step(2, 'Cook', '', 'done')}
      ${step(3, 'Weigh cooked', `
        <div class="input num" style="justify-content: flex-end; gap: 8px;">2.34 <span class="secondary">kg</span></div>
        <div style="background: ${T.bg}; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;">
          <div><span class="num" style="font-size: 17px; font-weight: 600;">75.5 %</span> <span class="secondary">actual yield · expected 75 %</span></div>
          <div><span class="num" style="font-size: 17px; font-weight: 600;">13 × 175 g</span> <span class="secondary">· 65 g left · 1 portion short</span></div>
        </div>`, 'active')}
      ${step(4, 'Store', '', 'todo')}
      <div class="btn primary" style="width: 100%; margin-top: 12px;">Next: Store ${I.chevR(18)}</div>
    </div>
    <div class="section">Tasks <span class="num" style="text-transform: none; letter-spacing: 0; font-weight: 500;">2 of 8</span></div>
    <div class="card">
      <div class="row" style="min-height: 48px;"><span class="cb on">${I.check(18)}</span><span class="grow" style="color: ${T.muted}; text-decoration: line-through;">Defrost chicken</span></div>
      <div class="row" style="min-height: 48px;"><span class="cb"></span><span class="grow">Portion vegetables 21 × 100 g</span></div>
      <div class="row" style="min-height: 48px;"><span class="cb"></span><span class="grow">Label containers with dates</span></div>
    </div>
    <div class="section">Storage</div>
    <div style="display: flex; gap: 8px;">
      <div class="tile"><span class="eyebrow" style="display: flex; align-items: center; gap: 4px;">${I.fridge(14)} Ready</span><span class="metric">6</span><span class="secondary">portions</span></div>
      <div class="tile"><span class="eyebrow" style="display: flex; align-items: center; gap: 4px;">${I.snow(14)} Freezer</span><span class="metric">8</span><span class="secondary">portions</span></div>
      <div class="tile" style="border-color: ${T.warn}; background: ${T.wtint};"><span class="eyebrow" style="color: ${T.warn};">Thaw tonight</span><span class="metric" style="color: ${T.warn};">2</span><span class="secondary" style="color: ${T.warn};">portions</span></div>
    </div>
  </div>
  ${nav('Prep', false)}
`);

// 10. Plan editor
const planMeal = (name, time, purpose, rows) => `
  <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span class="title">${name}</span>
      ${purpose ? `<span class="pill neutral">${purpose}</span>` : ''}
      <span class="grow"></span>
      <span class="secondary num">${time}</span>
      <span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span>
    </div>
    <div>${rows.map(([a, n]) => ing(a, n)).join('')}</div>
  </div>`;

const PlanEditor = doc('Plan editor', 1360, `
  ${header('Plan', 'Current plan', `<div class="btn text" style="margin-right: -8px;">${I.plus(18)} Add meal</div>`)}
  <div class="body">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <span class="secondary">Showing portions for</span>
      <div class="seg small" style="width: 200px;"><div class="on">Training</div><div>Rest</div></div>
    </div>
    ${planMeal('Meal 1', '8:00 AM', '', [['2', 'Eggs'], ['200 g', 'Egg whites'], ['2', 'Bagels'], ['½', 'Avocado']])}
    ${planMeal('Meal 2', '12:30 PM', '', [['225 g', 'White rice <span class="secondary">(cooked)</span>'], ['175 g', 'Chicken breast <span class="secondary">or turkey</span>'], ['100 g', 'Frozen vegetables'], ['1', 'Orange']])}
    ${planMeal('Meal 3', '5:30 PM', 'Pre-workout', [['70 g', 'Oats'], ['50 g', 'IsoWhey'], ['100 g', 'Frozen berries <span class="secondary">or banana</span>'], ['16 g', 'Peanut butter']])}
    <div class="secondary" style="text-align: center;">+ 2 more meals</div>
    <div class="section">Routine</div>
    <div class="card">
      <div class="row"><span style="color: ${T.muted}; display: flex;">${I.dumbbell(20)}</span><div class="grow"><div style="font-weight: 500;">Training days &amp; workouts</div><div class="secondary">Mon–Sun pattern and usual sessions</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
      <div class="row"><span style="color: ${T.muted}; display: flex;">${I.clock(20)}</span><div class="grow"><div style="font-weight: 500;">Meal timing</div><div class="secondary">Automatic times around training</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
      <div class="row"><span style="color: ${T.muted}; display: flex;">${I.checkCircle(20)}</span><div class="grow"><div style="font-weight: 500;">Supplements</div><div class="secondary">Doses and timing</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
    </div>
    <div class="section">Library</div>
    <div class="card">
      <div class="row"><div class="grow"><div style="font-weight: 500;">Foods</div><div class="secondary">Units, packages, yields, nutrition</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
      <div class="row"><div class="grow"><div style="font-weight: 500;">Substitutions</div><div class="secondary">Chicken or turkey, berries or banana</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
      <div class="row"><div class="grow"><div style="font-weight: 500;">Meal plans</div><div class="secondary">Create, copy or switch plans</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
    </div>
  </div>
  ${nav('Plan', false)}
`);

// 11. Settings
const field = (label, value, unit = '') => `
  <div style="display: flex; flex-direction: column; gap: 6px;">
    <span class="label">${label}</span>
    <div class="input num">${value}<span class="secondary">${unit}</span></div>
  </div>`;
const group = (title, inner, footer = 'Save') => `
  <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
    <div class="title" style="font-size: 15px;">${title}</div>
    ${inner}
    ${footer ? `<div style="display: flex; align-items: center; gap: 12px;"><div class="btn outline" style="flex: 1; height: 44px;">${footer}</div><span class="secondary" style="display: flex; align-items: center; gap: 4px; color: ${T.success};">${I.check(14)} Saved</span></div>` : ''}
  </div>`;

const Settings = doc('Settings', 1280, `
  ${header('Settings', '', '', true)}
  <div class="body">
    ${group('Water', `
      ${field('Daily target', '4.0', 'L')}
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
        ${field('Quick add A', '250', 'mL')}
        ${field('Quick add B', '500', 'mL')}
      </div>`)}
    ${group('Meals &amp; timing', `
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
        ${field('First meal', '8:00 AM')}
        ${field('Usual training', '7:30 PM')}
      </div>
      <div class="row" style="padding: 0; min-height: 44px; border-top: 0;"><div class="grow"><div style="font-weight: 500;">Automatic meal times</div><div class="secondary">Re-times the day around training</div></div><div style="width: 48px; height: 28px; border-radius: 999px; background: ${T.primary}; position: relative;"><span style="position: absolute; top: 2px; right: 2px; width: 24px; height: 24px; border-radius: 999px; background: #fff;"></span></div></div>`)}
    <div class="card row" style="border-top: 0;"><div class="grow"><div style="font-weight: 500;">Training days &amp; workouts</div><div class="secondary">Mon Chest + Triceps · Tue Back + Biceps · Wed Rest…</div></div><span style="color: ${T.muted}; display: flex;">${I.chevR(20)}</span></div>
    ${group('Storage &amp; prep', `
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
        ${field('Days in the fridge', '3')}
        ${field('Default portion', '175', 'g')}
      </div>`)}
    ${group('Reminders', `
      <div class="row" style="padding: 0; min-height: 44px; border-top: 0;"><div class="grow"><div style="font-weight: 500;">Browser notifications</div><div class="secondary">Asks for permission when turned on</div></div><div style="width: 48px; height: 28px; border-radius: 999px; background: ${T.inb}; position: relative;"><span style="position: absolute; top: 2px; left: 2px; width: 24px; height: 24px; border-radius: 999px; background: #fff;"></span></div></div>`, '')}
    ${group('Appearance', `
      <div class="seg small"><div>${I.sun(16)} Light</div><div>${I.moon(16)} Dark</div><div class="on">${I.monitor(16)} System</div></div>`, '')}
  </div>
  ${nav('More', false)}
`);

/* ---------------------------------------------------------------- write */
const files = {
  'Main.dc.html': Main,
  'TodayFull.dc.html': TodayFull,
  'MealDetail.dc.html': MealDetail,
  'DayState.dc.html': DayState,
  'Workout.dc.html': Workout,
  'WeekView.dc.html': WeekView,
  'Groceries.dc.html': Groceries,
  'ShoppingMode.dc.html': ShoppingMode,
  'PrepMode.dc.html': PrepMode,
  'PlanEditor.dc.html': PlanEditor,
  'Settings.dc.html': Settings,
};
for (const [name, html] of Object.entries(files)) writeFileSync(join(here, name), html);

const heights = { Main: 844, TodayFull: 1640, MealDetail: 844, DayState: 844, Workout: 844, WeekView: 880, Groceries: 844, ShoppingMode: 844, PrepMode: 1000, PlanEditor: 1360, Settings: 1280 };
const titles = {
  Main: 'Today · at open', TodayFull: 'Today · full page', MealDetail: 'Meal detail · time correction', DayState: 'Training / Rest switch',
  Workout: 'Workout selector', WeekView: 'Week view', Groceries: 'Groceries', ShoppingMode: 'Shopping Mode', PrepMode: 'Prep Mode', PlanEditor: 'Plan editor', Settings: 'Settings',
};
const row1 = ['Main', 'TodayFull', 'MealDetail', 'DayState', 'Workout', 'WeekView'];
const row2 = ['Groceries', 'ShoppingMode', 'PrepMode', 'PlanEditor', 'Settings'];
const artboards = [];
row1.forEach((n, i) => artboards.push({ file: `${n}.dc.html`, title: titles[n], x: i * 480, y: 0, w: 390, h: heights[n] }));
row2.forEach((n, i) => artboards.push({ file: `${n}.dc.html`, title: titles[n], x: i * 480, y: 1760, w: 390, h: heights[n] }));

const canvas = {
  artboards,
  annotations: [
    { id: 'brief', x: 0, y: -220, w: 460, text: 'PrepTracker mobile redesign\n\nRow 1: the daily loop. Open the app, read the day state, tap one action, close.\nRow 2: planning screens where more time is fine.\n\nTokens, sizes and copy come from docs/UI_DESIGN_SPEC.md. Nothing is implemented yet.' },
    { id: 'today-note', x: 0, y: 880, w: 390, text: 'Today at 390 × 844: the segmented Training/Rest control, the next meal with Mark eaten, and both water buttons are all visible without scrolling. Currently the first Mark as eaten is 1.8 screens down.' },
    { id: 'prep-note', x: 960, y: 2860, w: 390, text: 'Prep: one active step at a time per batch. The raw weight is prefilled from the current yield; the cooked weight shows the real yield and portions as you type.' },
  ],
  launch: { view: 'canvas' },
};
writeFileSync(join(here, 'canvas.json'), JSON.stringify(canvas, null, 2));
console.log(`wrote ${Object.keys(files).length} artboards and canvas.json to ${here}`);
