// Reads the Firestore rules (there's no emulator here) and checks the invite-only shape: every read and write needs a
// verified email on the allowlist, nobody can change the allowlist, and both copies of the rules are the same.
const fs = require('fs'), path = require('path');
const A = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
const B = fs.readFileSync(path.join(__dirname, '../../../firestore.rules'), 'utf8');
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
ok(A === B, 'rules: source/app/firestore.rules and firestore.rules are identical');
const src = A.replace(/\/\/.*$/gm, '');
const fn = name => { const m = new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(src); return m ? m[1] : ''; };
const allowed = fn('allowed');
ok(/email_verified', false\) == true/.test(allowed), 'allowed(): needs a verified email');
ok(/exists\(\/databases\/\$\(database\)\/documents\/allowed\/\$\(myEmail\(\)\)\)/.test(allowed), 'allowed(): looks up /allowed/{email}');
ok(/lower\(\)/.test(fn('myEmail')), 'allowed(): emails are matched in lower case');
ok(/allowed\(\)/.test(fn('isMember')), 'isMember(): includes allowed()');
// every allow statement, with the match block it sits in
const stmts = []; const stack = []; let i = 0;
const re = /match\s+(\S+)\s*\{|allow\s+([a-z, ]+):\s*if\s+([\s\S]*?);|\}/g; let m;
while ((m = re.exec(src))) {
  if (m[1]) stack.push(m[1]);
  else if (m[2]) stmts.push({ path: stack.join(''), ops: m[2].trim(), cond: m[3].replace(/\s+/g, ' ').trim() });
  else stack.pop();
}
ok(stmts.length >= 20, 'rules: found ' + stmts.length + ' allow statements');
for (const s of stmts) {
  if (s.cond === 'false') continue;
  if (/\/allowed\/\{email\}$/.test(s.path)) { ok(s.ops === 'get' && /email_verified/.test(s.cond) && /myEmail\(\) == email/.test(s.cond), 'allowlist: you can only see your own entry, once verified'); continue; }
  ok(/allowed\(\)|isMember\(/.test(s.cond), 'invite-only: ' + s.path + ' allow ' + s.ops + ' needs the allowlist');
}
const allowList = stmts.filter(s => /\/allowed\/\{email\}$/.test(s.path));
ok(allowList.some(s => /write/.test(s.ops) && s.cond === 'false') && !allowList.some(s => /write|create|update|delete/.test(s.ops) && s.cond !== 'false'), 'allowlist: nobody can write it from an app');
ok(stmts.filter(s => /households\/\{hid\}$/.test(s.path) && /update/.test(s.ops)).every(s => /^allowed\(\) &&/.test(s.cond)), 'joining with an invite code needs the allowlist too');
ok(!/allow\s+read,\s*write:\s*if\s+signedIn\(\)/.test(src) && !/if\s+signedIn\(\);/.test(src), 'no rule lets in anyone just for being signed in');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
