import { readFileSync } from 'node:fs';
import { env } from 'node:process';

const ref = env.SUPABASE_PROJECT_REF;
const pat = env.SUPABASE_PAT;
const file = env.SQL_FILE;

if (!ref || !pat || !file) {
  console.error('Usage: SUPABASE_PROJECT_REF=... SUPABASE_PAT=... SQL_FILE=... node scripts/apply-sql.mjs');
  process.exit(1);
}

const query = readFileSync(file, 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}:`, text.slice(0, 2000));
  process.exit(1);
}
console.log(`OK ${res.status} — applied ${file}`);
if (text) console.log(text.slice(0, 1500));