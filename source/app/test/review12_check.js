// Twelfth review (usability): the main thing to do on each screen comes first and every change says it happened.
// An empty week leads with "Fill the week for me"; an empty night is one line; choosing a dinner shows short reasons;
// a planned night's sheet puts cooking and changing it before the numbers; thumbs only for nights still to come; a new
// person opens on their own page; breakfasts and lunches open on whoever's phone it is and "Turn it on" lands on the
// switch; an item's name ticks it on the list; a logged shop reads simply; cooking keeps one header shape and says
// "Enjoy" at the end; the kitchen's first check is one note. Needs test/app.test.js built first. Exits 1 if anything fails.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const now = new Date(), TODAY_IDX = (now.getDay() + 6) % 7;
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
function boot(user, pre) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/es-kitchen/',
    beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.__user = user; if (pre) w.__preDocs = new Map(pre); } });
  const w = dom.window, d = w.document, errs = []; w.addEventListener('error', e => errs.push(e.message));
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  const act = async (a, v, ms, extra) => { const b = d.createElement('button'); b.dataset.act = a; if (v != null) b.dataset.v = v; Object.assign(b.dataset, extra || {}); d.body.appendChild(b); b.click(); b.remove(); await wait(ms || 80); };
  const tap = async (sel, ms) => { const el = d.querySelector(sel); if (!el) { ok(false, 'missing ' + sel); return false; } el.click(); await wait(ms || 80); return true; };
  const T = sel => ((d.querySelector(sel) || {}).textContent || '').replace(/\s+/g, ' ').trim();
  const submit = async (sel, ms) => { d.querySelector(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms || 300); };
  const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & w.Node.DOCUMENT_POSITION_FOLLOWING));
  return { w, d, errs, act, tap, T, submit, before };
}
(async () => {
  const A = boot({ uid: 'u_e', name: 'Ethan Whitfield', email: 'ethan@example.com' });
  const { d, act, tap, T, submit, before } = A;
  await wait(150);
  d.querySelector('#cr-me').value = 'Ethan Whitfield'; await submit('[data-form="create"]', 500);

  // ---- 1. a new person opens on their own page, and it says so ----
  await act('tab', 'settings'); await act('set-page', 'people');
  ok(d.querySelector('#np-name').placeholder === 'Add someone else', 'who’s eating: the add box’s hint fits ("Add someone else")');
  d.querySelector('#np-name').value = 'Sophie Marchetti'; await submit('[data-form="add-person"]');
  ok(T('[data-act="set-person"].on') === 'Sophie', 'who’s eating: adding Sophie opens her page');
  ok(/Sophie added/.test(T('#toast')), 'who’s eating: and says she was added (' + T('#toast') + ')');
  const labels = [...d.querySelectorAll('#pplan .grid2 label.field > span')].map(x => x.textContent);
  ok(labels.join('|') === 'Daily calories|Daily protein (g)', 'who’s eating: the two targets have short labels (' + labels.join('|') + ')');
  ok([...d.querySelectorAll('#pplan .grid2 input')].every(x => x.placeholder === 'Optional'), 'who’s eating: and say they’re optional in the box');
  await act('set-page', ''); await act('tab', 'week', 150);

  // ---- 2. an empty week leads with the one thing to do ----
  ok(before(d.querySelector('.weekfoot [data-act="fill"]'), d.querySelector('.days')), 'empty week: "Fill the week for me" comes before the nights');
  const emptyRow = d.querySelector('.meal.empty[data-act="pick"][data-v="0"]');
  ok(!!emptyRow && emptyRow.children.length === 2 && /^\+ Choose dinner$/.test(emptyRow.children[0].textContent) && /min$/.test(emptyRow.children[1].textContent), 'empty week: a night reads "+ Choose dinner" with its time beside it');
  await act('fill', null, 7000);
  ok(before(d.querySelector('.days'), d.querySelector('.weekfoot')), 'planned week: what to do next goes back under the nights');

  // ---- 3. thumbs are only asked for nights still to come ----
  await act('votes', null, 200);
  const rows = d.querySelectorAll('#sheet .voterow').length, toCome = 7 - TODAY_IDX;
  ok(rows <= toCome && rows > 0, 'thumbs: one row for each night still to come (' + rows + ' of ' + toCome + ')');
  await act('sheet-back');

  // ---- 4. choosing a dinner: short reasons ----
  const night = Math.max(TODAY_IDX, 0);
  await act('pick', String(night), 900);
  const spare = T('#sheet .note');
  ok(!/You’ll have spare/.test(spare) || (spare.split(',').length <= 3 && (!/more\./.test(spare) || / and \d+ more\./.test(spare))), 'choosing: the spare note names three things at most');
  const whys = [...d.querySelectorAll('#sheet .sugg .why')].map(x => x.querySelector('b') ? x.querySelector('b').textContent : '');
  ok(whys.length > 0 && whys.every(b => b.split(/,\s(?=\d|½|¼|¾|⅓|a\s|an\s)/).length <= 2), 'choosing: each choice names two things it uses at most');
  await act('sheet-back');

  // ---- 5. a planned night: cook it or change it first, numbers after ----
  await act('open-day', String(night), 400);
  const cook = d.querySelector('#sheet .panel [data-act="cook"]'), change = d.querySelector('#sheet [data-act="change-day"]');
  ok(before(cook, d.querySelector('#sheet .nutri')) && before(cook, d.querySelector('#sheet .ratebox')), 'a night: Start cooking comes before the nutrition and the rating');
  ok(before(change, d.querySelector('#sheet [data-act="guests"]')) && before(change, d.querySelector('#sheet [data-act="move-day"]')), 'a night: Change dinner comes before guests, extras and moving it');
  await act('sheet-back');

  // ---- 6. cooking: one header shape, and a word at the end ----
  await tap('[data-act="open-day"][data-v="' + night + '"]', 300); await tap('#sheet .panel [data-act="cook"]', 200);
  ok(!!d.querySelector('#cook .chead .cchips [data-act="cook-ings"]'), 'cooking: Read aloud and Ingredients sit on their own line');
  let guard = 0; while (d.querySelector('#cook [data-act="cook-next"]') && guard++ < 30) await tap('#cook [data-act="cook-next"]', 40);
  ok(d.querySelector('#cook .cfoot [data-act="cook-close"]').dataset.v === 'done', 'cooking: the last step ends with Done');
  await tap('#cook .cfoot [data-act="cook-close"]', 100);
  ok(d.querySelector('#cook').hidden && /Enjoy your dinner/.test(T('#toast')), 'cooking: Done closes it and says "Enjoy your dinner!"');
  await act('sheet-back');

  // ---- 7. the shop: tap the name to tick it; a logged shop reads simply ----
  await act('tab', 'shop', 300);
  const name = d.querySelector('#app .item .itap[data-act="tick"]');
  const id = name && name.dataset.v; if (name) { name.querySelector('.iname').click(); await wait(150); }
  ok(!!id && !!d.querySelector('#app .item.done [data-act="tick"].check[data-v="' + id + '"]'), 'shop: tapping an item’s name ticks it');
  d.querySelector('#extra-name').value = 'Kitchen roll'; await submit('[data-form="extra"]', 200);
  const extra = d.querySelector('#sec-extras .iname.itap'); if (extra) { extra.click(); await wait(150); }
  ok(!!d.querySelector('#sec-extras .item.done'), 'shop: and the same for something added under "Anything else?"');
  await act('shop-view', 'cost', 200);
  d.querySelector('#ls-amt').value = '40.00'; await submit('[data-form="logshop"]', 300);
  const line = T('#app .leftlist .left');
  ok(/Ethan paid · £20\.00 each/.test(line) && !/half each,/.test(line), 'shop log: "Ethan paid · £20.00 each" (' + line.slice(0, 80) + ')');

  // ---- 8. the kitchen’s first cupboard check is one note, with how it works folded away ----
  await act('tab', 'kitchen', 200);
  ok(!!d.querySelector('#app .note [data-act="pantry-checked"]') && /How Low and Always buy work/.test(T('#app details summary')) && !d.querySelector('#app details[open]'), 'kitchen: the first check is one note; how Low works is folded');

  // ---- 9. app-wide: tick boxes in the app’s colour, paragraphs spaced by the gap ----
  ok(/input\[type="checkbox"\], input\[type="radio"\] \{ accent-color: var\(--accent\); \}/.test(html), 'look: tick boxes and choices use the app’s green');
  ok(/:is\(\.app, \.panel, \.stack, \.sbody, \.auth, \.cbody\) > p \{ margin: 0; \}/.test(html), 'look: paragraphs in cards are spaced like everything else');
  ok(!A.errs.length, 'no page errors ' + A.errs.join(' | '));

  // ---- 10. Sophie’s phone: breakfasts and lunches open on her, and "Turn it on" lands on the switch ----
  const docs = [...A.w.__docs.entries()];
  const sPerson = docs.find(([k, v]) => /^households\/h1\/people\//.test(k) && v.name === 'Sophie Marchetti');
  sPerson[1] = { ...sPerson[1], uid: 'u_s' };
  docs.push(['users/u_s', { households: ['h1'], current: 'h1', names: { h1: 'Kitchen' } }]);
  const B = boot({ uid: 'u_s', name: 'Sophie Marchetti', email: 'sophie@example.com' }, docs);
  await wait(600);
  await B.act('week-view', 'bl', 300);
  ok(B.T('[data-act="bl-person"].on') === 'Sophie', 'breakfast & lunch: opens on Sophie on her phone');
  ok(/^Sophie’s breakfasts and lunches/.test(B.T('#app .blpanel .note')), 'breakfast & lunch: her short name in the note');
  const on = B.d.querySelector('#app [data-act="go-set"]');
  ok(!!on && on.dataset.s === 'pplan', '"Turn it on" is aimed at the plan switches');
  let landed = false; const el0 = () => B.d.querySelector('#pplan');
  B.w.HTMLElement.prototype.scrollIntoView = function () { if (this.id === 'pplan') landed = true; };
  if (on) { on.click(); await wait(150); }
  ok(!!el0() && landed && B.T('[data-act="set-person"].on') === 'Sophie', '"Turn it on" opens her settings at the plan switches');
  ok(!B.errs.length, 'Sophie’s phone: no page errors ' + B.errs.join(' | '));

  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
