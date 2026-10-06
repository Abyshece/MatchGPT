// Fills in the answers every member gives (fixtures.mjs) where an account
// doesn't have them yet, so the tests that sign in with it go straight to the
// app rather than the required-details screen. Run it once for the accounts
// you pass to the other tests.
// Usage: node fill-required.mjs <email> [email…]
import { execSync } from 'node:child_process';
import { REQUIRED_DETAILS } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const emails = process.argv.slice(2);
if (!emails.length) { console.error('usage: node fill-required.mjs <email> [email…]'); process.exit(2); }
const list = emails.map((e) => `'${e.replace(/'/g, "''")}'`).join(', ');
const out = execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, {
  input: `update profiles set ${REQUIRED_DETAILS} where email in (${list}) returning email;`,
}).toString().trim();
const done = out ? out.split('\n').filter((l) => l.includes('@')) : [];
for (const e of emails) console.log(done.includes(e) ? `filled in: ${e}` : `no such account: ${e}`);
process.exit(done.length === emails.length ? 0 : 1);
