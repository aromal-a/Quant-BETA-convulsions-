import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeClient } from './trade.js';

const FILE = path.join(os.homedir(), '.quantbeam-test-session.json');
const fileStorage = {
  read: () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}),
  getItem(k) { return this.read()[k] ?? null; },
  setItem(k, v) { const d = this.read(); d[k] = v; fs.writeFileSync(FILE, JSON.stringify(d), { mode: 0o600 }); },
  removeItem(k) { const d = this.read(); delete d[k]; fs.writeFileSync(FILE, JSON.stringify(d), { mode: 0o600 }); },
};
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

async function main() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  const email = `quantbeam.test+${Date.now()}@example.com`;
  const password = crypto.randomUUID();

  const app = makeClient(fileStorage);
  const { data: su, error: suErr } = await app.auth.signUp({ email, password });
  check('new user can sign up', !suErr && !!su.user, suErr?.message);
  check('session issued (Confirm email is off)', !!su.session, su.session ? '' : 'turn off Confirm email in Supabase Auth');
  if (!su.session) return;
  const uid = su.user.id;

  const { data: prof } = await app.from('profiles').select('id, display_name').eq('id', uid).maybeSingle();
  check('profile row auto-created', prof?.id === uid, prof?.display_name ?? '');

  const { error: evErr } = await app.from('sign_in_events').insert({ user_id: uid, provider: 'email', platform: 'web', is_new_user: true });
  check('sign-in event logged (new user)', !evErr, evErr?.message);

  const raw = fs.readFileSync(FILE, 'utf8');
  check('session saved to device storage', raw.includes('refresh_token'));
  check('password never written to storage', !raw.includes(password));

  const restarted = makeClient(fileStorage);
  const { data: s2 } = await restarted.auth.getSession();
  const { data: u2, error: u2Err } = await restarted.auth.getUser();
  check('restored session after restart', s2.session?.user.id === uid);
  check('server accepts restored session', !u2Err && u2.user?.id === uid, u2Err?.message);

  const before = s2.session.access_token;
  const { data: r, error: rErr } = await restarted.auth.refreshSession();
  check('token refresh works', !rErr && r.session && r.session.access_token !== before, rErr?.message);

  const mem = makeClient();
  const { error: bad } = await mem.auth.signInWithPassword({ email, password: 'wrong-password' });
  check('wrong password rejected', !!bad);
  const { data: good, error: goodErr } = await mem.auth.signInWithPassword({ email, password });
  check('returning user can sign in', !goodErr && good.user?.id === uid, goodErr?.message);
  if (good.user) await mem.from('sign_in_events').insert({ user_id: uid, provider: 'email', platform: 'web', is_new_user: false });

  const other = makeClient();
  const { data: o } = await other.auth.signUp({ email: `quantbeam.other+${Date.now()}@example.com`, password: crypto.randomUUID() });
  if (o?.session) {
    const { data: peek } = await other.from('profiles').select('id').eq('id', uid);
    const { data: peekEv } = await other.from('sign_in_events').select('id').eq('user_id', uid);
    check("other user can't see this profile", (peek ?? []).length === 0);
    check("other user can't see this user's sign-ins", (peekEv ?? []).length === 0);
  }

  const { data: evs } = await restarted.from('sign_in_events').select('is_new_user').eq('user_id', uid);
  check('2 sign-ins recorded (1 new, 1 returning)', evs?.length === 2 && evs.filter(e => e.is_new_user).length === 1);
  console.log(`\nTest user: ${email}\nSession saved at ${FILE}\nNow run: npm run test:resume`);
}

async function resume() {
  if (!fs.existsSync(FILE)) { console.log('No saved session. Run npm run test:auth first.'); process.exit(1); }
  const app = makeClient(fileStorage);
  const { data, error } = await app.auth.getUser();
  check('new process restored user without password', !error && !!data.user, data.user?.email ?? error?.message);
  if (!data.user) return;
  await app.auth.signOut();
  const { data: after } = await makeClient(fileStorage).auth.getSession();
  check('sign-out clears saved session', !after.session);
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}

await (process.argv.includes('--resume') ? resume() : main());
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
