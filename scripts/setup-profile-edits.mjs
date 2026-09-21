import { readFileSync } from 'node:fs';

const ref = process.env.SUPABASE_PROJECT_REF;
const pat = process.env.SUPABASE_PAT;
const H = { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' };
const base = `https://api.supabase.com/v1/projects/${ref}`;

async function runSql(query) {
  const r = await fetch(`${base}/database/query`, { method: 'POST', headers: H, body: JSON.stringify({ query }) });
  const text = await r.text();
  console.log(`[sql ${r.status}]`, text.slice(0, 300));
  return r;
}

const migration = readFileSync('supabase/migrations/20260921_profile_edits_and_leaderboard.sql', 'utf8');
await runSql(migration);

const authRes = await fetch(`${base}/config/auth`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ disable_signup: false, mailer_autoconfirm: true, site_url: 'https://bomba-app-second.vercel.app' }),
});
console.log('[authconfig', authRes.status, ']', (await authRes.text()).slice(0, 500));

await runSql(
  "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), confirmation_sent_at = now() where email_confirmed_at is null;",
);

await runSql(
  "select email, email_confirmed_at is not null as confirmed, (select username from profiles where profiles.id = auth.users.id) as profile_user from auth.users order by created_at;",
);
await runSql("select * from leaderboard;");