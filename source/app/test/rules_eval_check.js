// Runs Peckish's Firestore rules (firestore.rules) against crafted requests, with the stand-in rules engine in
// rules_eval.mjs (there's no emulator here): joining with an invite code, membership, households, invites and photos,
// tried by outsiders, signed-up strangers not on the allowlist, members of another household and members themselves.
// Exits 1 if anything fails.
const fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
(async () => {
  const { loadRules } = await import('./rules_eval.mjs');
  const rules = loadRules(fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'));
  const ME = { email: 'sophie@example.com', uid: 'u_sophie' }, ETHAN = { email: 'ethan@example.com', uid: 'u_ethan' };
  const MUM = { email: 'mum@example.com', uid: 'u_mum' }, STRANGER = { email: 'stranger@example.com', uid: 'u_x' };
  const base = () => ({
    'allowed/sophie@example.com': {}, 'allowed/ethan@example.com': {}, 'allowed/mum@example.com': {},
    'households/h1': { name: 'E&S', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'K7RM2Q', joinCode: 'K7RM2Q.u_old' },
    'households/h1/weeks/2026-10-26': { days: {} },
    'households/h2': { name: 'Mum', members: ['u_mum'], memberNames: { u_mum: 'Mum' }, inviteCode: 'MUM234' },
    'invites/K7RM2Q': { hid: 'h1' }, 'invites/MUM234': { hid: 'h2' },
  });
  const can = (who, method, p, data, db, extra) => rules.allowed({ method, path: p, email: who && who.email, uid: who && who.uid, db: db || base(), data, ...(extra || {}) });
  const after = (db, p, patch) => ({ ...db[p], ...patch });
  // sanity: the engine reads these rules at all
  ok(can(ETHAN, 'get', 'households/h1'), 'engine: a member can read their household');
  ok(!can(ME, 'get', 'households/h1'), 'engine: someone not in it can’t');

  // ---- joining ----
  const db = base(), H = 'households/h1';
  const join = (who, patch, d) => can(who, 'update', H, after(d || db, H, patch), d || db);
  ok(join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie', memberNames: { u_ethan: 'Ethan', u_sophie: 'Sophie' } }), 'join: with the code, saved as CODE.uid, you add yourself and your name');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], memberNames: { u_ethan: 'Ethan', u_sophie: 'Sophie' } }), 'join: leaving the last joiner’s CODE.uid there doesn’t let you in');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_old' }), 'join: someone else’s CODE.uid doesn’t let you in');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'WRONG1.u_sophie' }), 'join: a wrong code doesn’t');
  ok(join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q' }), 'join: the plain code written now still works (older copy of the app)');
  const plainLeft = { ...base(), [H]: { ...base()[H], joinCode: 'K7RM2Q' } };
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'] }, plainLeft), 'join: a plain code left by the last joiner doesn’t let in the next one');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie', 'u_mum'], joinCode: 'K7RM2Q.u_sophie' }), 'join: you can’t bring someone else in with you');
  ok(!join(ME, { members: ['u_sophie', 'u_mum'], joinCode: 'K7RM2Q.u_sophie' }), 'join: you can’t swap a member out for someone');
  ok(!join(ME, { members: ['u_sophie'], joinCode: 'K7RM2Q.u_sophie' }), 'join: you can’t replace the members with yourself');
  ok(!join(ME, { members: ['u_ethan', 'u_mum'], joinCode: 'K7RM2Q.u_sophie' }), 'join: you can’t add only someone else');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie', memberNames: { u_ethan: 'Liar', u_sophie: 'Sophie' } }), 'join: you can’t change anyone else’s name');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie', memberNames: { u_ethan: 'Ethan', u_mum: 'Mum' } }), 'join: you can’t add a name for someone else');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie', inviteCode: 'MINE22' }), 'join: you can’t change the invite code');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie', name: 'Mine now' }), 'join: you can’t rename it');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie', memberEmails: { u_sophie: 'x' } }), 'join: nothing else comes with joining');
  ok(!join(STRANGER, { members: ['u_ethan', 'u_x'], joinCode: 'K7RM2Q.u_x' }), 'join: someone not on the allowlist can’t, even with the code');
  ok(!can(ME, 'update', H, after(db, H, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie' }), db, { verified: false }), 'join: an unconfirmed email can’t');
  ok(!can(null, 'update', H, after(db, H, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie' }), db), 'join: signed out can’t');
  // an old code after a new one is made
  const renewed = { ...base(), [H]: { ...base()[H], inviteCode: 'NEW777' } };
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q.u_sophie' }, renewed), 'join: the old code stops working once a new one is made');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'], joinCode: 'K7RM2Q' }, renewed), 'join: ...plain or not');
  // leaving and coming back: the code left there is yours, but it only works while it's still the household's code
  const left = { ...base(), [H]: { ...base()[H], joinCode: 'K7RM2Q.u_sophie' } };
  ok(join(ME, { members: ['u_ethan', 'u_sophie'] }, left), 'rejoin: someone who left can come back while the code they used is still the code');
  ok(!join(ME, { members: ['u_ethan', 'u_sophie'] }, { ...left, [H]: { ...left[H], inviteCode: 'NEW777' } }), 'rejoin: ...but not once a new code is made');
  // the household's creator
  ok(can(ME, 'create', 'households/h9', { name: 'Mine', members: ['u_sophie'], memberNames: { u_sophie: 'Sophie' }, inviteCode: 'ABC234' }), 'create: you can start a household with just you in it');
  ok(!can(ME, 'create', 'households/h9', { name: 'Mine', members: ['u_sophie', 'u_ethan'], inviteCode: 'ABC234' }), 'create: ...not with someone else in it');
  ok(!can(ME, 'create', 'households/h9', { name: 'Mine', members: ['u_ethan'], inviteCode: 'ABC234' }), 'create: ...or only someone else');
  ok(!can(STRANGER, 'create', 'households/h9', { name: 'Mine', members: ['u_x'] }), 'create: not on the allowlist, you can’t');
  // (writing a whole new household over one that's there is an update, so only the join rule could let it through)
  ok(!can(ME, 'update', H, { name: 'Mine', members: ['u_sophie'], memberNames: { u_sophie: 'Sophie' }, inviteCode: 'ABC234' }, db), 'create: an existing household can’t be taken over by writing a new one over it');

  // ---- members, other households ----
  const two = { ...base(), [H]: { ...base()[H], members: ['u_ethan', 'u_sophie'], memberNames: { u_ethan: 'Ethan', u_sophie: 'Sophie' } } };
  ok(can(ME, 'update', H, after(two, H, { name: 'Our kitchen' }), two), 'member: can rename the household');
  ok(can(ME, 'update', H, after(two, H, { members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' } }), two), 'member: can leave');
  ok(!can(ME, 'delete', H, undefined, two), 'member: can’t delete the household itself (nobody could open it again)');
  ok(!can(MUM, 'delete', H, undefined, two), 'another household: can’t delete it');
  ok(can(ME, 'get', H + '/weeks/2026-10-26', undefined, two) && can(ME, 'update', H + '/weeks/2026-10-26', { days: { d0: { r: 'x' } } }, two), 'member: reads and writes the plan');
  ok(can(ME, 'delete', H + '/weeks/2026-10-26', undefined, two) && can(ME, 'create', H + '/shops/s1', { amount: 5 }, two), 'member: deletes a week, logs a shop');
  ok(!can(MUM, 'get', H + '/weeks/2026-10-26', undefined, two) && !can(MUM, 'update', H + '/weeks/2026-10-26', { days: {} }, two), 'another household’s member: can’t read or write this one’s plan');
  ok(!can(MUM, 'get', H, undefined, two) && !can(MUM, 'update', H, after(two, H, { name: 'x' }), two), 'another household’s member: can’t read or change the household');
  ok(!can(MUM, 'create', H + '/people/p_mum', { name: 'Mum' }, two), 'another household’s member: can’t add themselves to Who’s eating');
  ok(!can(STRANGER, 'get', H + '/weeks/2026-10-26', undefined, { ...two, [H]: { ...two[H], members: ['u_ethan', 'u_sophie', 'u_x'] } }), 'someone taken off the allowlist: can’t read even a household they’re in');
  ok(!can(ME, 'get', 'households/gone/weeks/2026-10-26', undefined, two) && !can(ME, 'create', 'households/gone/weeks/2026-10-26', { days: {} }, two), 'a household that doesn’t exist: nothing under it can be read or written');
  ok(!can(ME, 'list', 'households/h2', undefined, two), 'list: can’t list households');

  // ---- invites ----
  ok(can(ME, 'get', 'invites/K7RM2Q') && !can(STRANGER, 'get', 'invites/K7RM2Q') && !can(ME, 'list', 'invites/K7RM2Q'), 'invites: on the allowlist you can look up a code you know, not list them');
  ok(can(ETHAN, 'create', 'invites/NEW777', { hid: 'h1' }) && !can(ETHAN, 'create', 'invites/NEW777', { hid: 'h2' }), 'invites: a member makes codes for their own household only');
  ok(!can(ETHAN, 'delete', 'invites/MUM234') && can(MUM, 'delete', 'invites/MUM234'), 'invites: only the household’s members take its code away');
  ok(!can(ETHAN, 'update', 'invites/MUM234', { hid: 'h1' }), 'invites: a code can’t be pointed at another household');

  // ---- accounts and the allowlist ----
  ok(can(ME, 'get', 'users/u_sophie', undefined) && !can(ME, 'get', 'users/u_ethan') && !can(ME, 'update', 'users/u_ethan', { current: 'h1' }), 'users: only your own account record');
  ok(can(ME, 'get', 'allowed/sophie@example.com') && !can(ME, 'get', 'allowed/ethan@example.com') && !can(ME, 'create', 'allowed/mum2@example.com', {}), 'allowlist: see your own entry only, never change it');
  ok(!can(STRANGER, 'create', 'allowed/stranger@example.com', {}) && can(STRANGER, 'get', 'allowed/stranger@example.com'), 'allowlist: a stranger can only see that they’re not on it');

  // ---- shared photos ----
  const ph = { ...two, 'dishThumbs/r1': { uid: 'u_ethan', hid: 'h1', thumb: 'x' }, 'dishThumbs/r2': { uid: 'u_mum', hid: 'h2', thumb: 'x' } };
  ok(can(MUM, 'get', 'dishThumbs/r1', undefined, ph) && !can(STRANGER, 'get', 'dishThumbs/r1', undefined, ph), 'photos: everyone on the allowlist sees them, nobody else');
  ok(can(ME, 'update', 'dishThumbs/r1', { uid: 'u_sophie', hid: 'h1', thumb: 'y' }, ph), 'photos: someone in the household that added it can replace it');
  ok(!can(MUM, 'update', 'dishThumbs/r1', { uid: 'u_mum', hid: 'h2', thumb: 'y' }, ph), 'photos: another household can’t replace it');
  ok(!can(MUM, 'update', 'dishThumbs/r1', { uid: 'u_mum', hid: 'h1', thumb: 'y' }, ph), 'photos: ...even by saying it’s from that household');
  ok(!can(ME, 'create', 'dishThumbs/r9', { uid: 'u_ethan', hid: 'h1', thumb: 'y' }, ph) && !can(ME, 'create', 'dishThumbs/r9', { uid: 'u_sophie', hid: 'h2', thumb: 'y' }, ph), 'photos: you can’t add one as someone else or from a household you’re not in');
  ok(!can(ME, 'delete', 'dishThumbs/r1', undefined, ph) && can(ETHAN, 'delete', 'dishThumbs/r1', undefined, ph), 'photos: only the person who added one deletes it');
  ok(!can(ME, 'create', 'dishThumbs/r9', { uid: 'u_sophie', hid: 'h1', thumb: 'x'.repeat(300001) }, ph), 'photos: a thumbnail can’t be huge');
  // ---- logged shops: nobody can make a shop go into someone else's Budgie ----
  const fam = { ...two, [H]: { ...two[H], members: ['u_ethan', 'u_sophie', 'u_mum'] } };
  const S1 = H + '/shops/s1';
  const shopDoc = (x) => ({ date: '2026-10-27', amount: 30, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: '2026-10-26', source: 'peckish', by: 'Sophie', byUid: 'u_sophie', budgie: { state: 'queued', person: 'ethan' }, ...(x || {}) });
  const withShop = (d) => ({ ...fam, [S1]: d || shopDoc() });
  const upd = (who, patch, d) => { const db0 = withShop(d); return can(who, 'update', S1, { ...db0[S1], ...patch }, db0); };
  ok(can(ME, 'create', S1, shopDoc(), fam), 'shops: logging a shop as yourself');
  ok(!can(MUM, 'create', S1, shopDoc(), fam), 'shops: a family member can’t log one as if Sophie logged it');
  ok(!can(MUM, 'create', S1, shopDoc({ byUid: undefined }), fam) && !can(MUM, 'create', S1, (({ byUid, ...x }) => x)(shopDoc()), fam), 'shops: ...or as an older copy of the app would (nobody named)');
  ok(!can(MUM, 'create', S1, shopDoc({ byUid: 'u_mum', okBy: 'u_ethan' }), fam) && can(MUM, 'create', S1, shopDoc({ byUid: 'u_mum' }), fam), 'shops: ...or say Ethan has added it; logging it as herself is fine');
  ok(can(ETHAN, 'create', H + '/shops/b_t1', { date: '2026-10-27', amount: 12, source: 'budgie', byUid: 'u_ethan', budgie: { state: 'sent', tid: 't1', person: 'sophie' } }, fam), 'shops: a Budgie payment brought in');
  ok(can(ETHAN, 'create', S1, shopDoc({ budgie: { state: 'sent', tid: 't-pk-s1', person: 'ethan' } }), fam), 'shops: restoring one that’s already in Budgie');
  ok(!can(ETHAN, 'create', S1, shopDoc(), fam), 'shops: ...but not one still waiting to go that someone else logged');
  ok(upd(ETHAN, { budgie: { state: 'sent', tid: 't-pk-s1-uu_ethan', person: 'ethan' } }) && upd(ETHAN, { budgie: { state: 'refused', why: 'x', person: 'ethan' } }), 'shops: the payer’s phone marks it sent or refused');
  ok(upd(ETHAN, { okBy: 'u_ethan' }), 'shops: the payer says it’s theirs (Add to my Budgie)');
  ok(!upd(MUM, { okBy: 'u_ethan' }) && !upd(ME, { okBy: 'u_ethan' }), 'shops: nobody else can say that for them');
  ok(!upd(ETHAN, { okBy: 'u_mum' }, shopDoc({ okBy: 'u_ethan' })) && upd(ETHAN, { okBy: 'u_ethan' }, shopDoc({ okBy: 'u_mum' })), 'shops: okBy is only ever the account writing it');
  ok(!upd(MUM, { byUid: 'u_mum' }) && !upd(MUM, { byUid: 'u_ethan' }, shopDoc({ byUid: 'u_mum' })), 'shops: who logged it can’t be changed');
  ok(!can(MUM, 'update', S1, (({ byUid, ...x }) => x)(shopDoc()), withShop()), 'shops: ...or taken off');
  ok(!upd(MUM, { byUid: 'u_ethan' }, (({ byUid, ...x }) => x)(shopDoc())), 'shops: ...or added to an older shop');
  ok(!upd(MUM, { amount: 1999 }) && !upd(MUM, { paidBy: 'u_sophie' }) && !upd(MUM, { date: '2026-11-20' }) && !upd(MUM, { split: '' }), 'shops: what a waiting shop would send can’t be changed');
  ok(!upd(MUM, { budgie: { state: 'queued', person: 'sophie' } }), 'shops: ...or who it goes to');
  ok(!upd(MUM, { amount: 500, budgie: { state: 'queued', person: 'ethan' } }, shopDoc({ budgie: { state: 'sent', tid: 't-pk-s1', person: 'ethan' } })), 'shops: one already sent can’t be made to wait (and go) again');
  ok(!upd(MUM, { amount: 500 }, (({ byUid, ...x }) => x)(shopDoc())), 'shops: an older waiting shop (nobody named) keeps what it would send');
  ok(upd(ETHAN, { amount: 31.5, date: '2026-10-28', week: '2026-10-26' }, shopDoc({ budgie: { state: 'sent', tid: 't-pk-s1', person: 'ethan' } })), 'shops: a change made in Budgie comes back to a sent shop');
  ok(upd(ME, { removed: true }, shopDoc({ budgie: { state: 'sent', tid: 't-pk-s1', person: 'ethan' } })), 'shops: anyone in the household can take off a sent shop');
  ok(can(ETHAN, 'update', H + '/shops/b_t1', { date: '2026-10-27', amount: 13, source: 'budgie', byUid: 'u_ethan', via: 'ethan', budgie: { state: 'sent', tid: 't1', person: 'sophie' } }, { ...fam, [H + '/shops/b_t1']: { date: '2026-10-27', amount: 12, source: 'budgie', byUid: 'u_ethan', budgie: { state: 'sent', tid: 't1', person: 'sophie' } } }), 'shops: a Budgie payment changed there is written again');
  ok(can(MUM, 'delete', S1, undefined, withShop()) && !can(STRANGER, 'delete', S1, undefined, withShop()) && can(MUM, 'get', S1, undefined, withShop()), 'shops: members read and remove them');
  ok(!can({ email: 'mum@example.com', uid: 'u_mum2' }, 'get', S1, undefined, withShop()), 'shops: someone outside the household can’t read them');
  ok(can(ME, 'update', H + '/weeks/2026-10-26', { days: { d0: { r: 'x' } } }, fam) && can(ME, 'create', H + '/people/p9', { name: 'X' }, fam), 'shops: the rest of the household is as it was');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
