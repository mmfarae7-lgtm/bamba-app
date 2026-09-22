/**
 * طبقة تكامل موحّدة لمصادر المباريات (API) — تُربط لاحقاً بمصدر حقيقي.
 *
 * الإعداد عبر متغيرات البيئة:
 *   VITE_FIXTURES_API_URL — رابط نقطة جلب المباريات (مثال: https://api.example.com/fixtures)
 *   VITE_FIXTURES_API_KEY — مفتاح دخول إن لزم (يُرسل كترويسة Authorization: Bearer)
 *
 * عند تعبئة الرابط تُقرأ مباريات التطبيق كاملاً من هذا المصدر بدل المباريات التجريبية الثابتة.
 * مزامنة الجداول للقاعدة تتم من لوحة التحكم (قسم المباريات) لأغراض التوقعات والاحتساب.
 */

export interface Fixture {
  /** تاريخ المباراة بصيغة YYYY-MM-DD */
  matchDate: string;
  /** التوقيت بصيغة HH:MM (24 ساعة) */
  time: string;
  league: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  points: number;
  featured: boolean;
  /** معرّف المباراة لدى المصدر الخارجي — يُستخدم لمنع التكرار عند المزامنة */
  externalId?: string;
}

const CFG = {
  url: (import.meta.env.VITE_FIXTURES_API_URL as string | undefined)?.trim() ?? '',
  key: (import.meta.env.VITE_FIXTURES_API_KEY as string | undefined)?.trim() ?? '',
};

export const fixturesApiConfigured = CFG.url.length > 0;

/** جلب مباريات لنطاق تاريخي من مصدر الـAPI المكوَّن. */
export async function fetchFixtures(fromDate: string, toDate: string): Promise<Fixture[]> {
  if (!CFG.url) {
    console.info('[fixtures] لم يُعدّ رابط VITE_FIXTURES_API_URL بعد — اربط المصدر في ملف .env ثم أعد البناء.');
    return [];
  }
  const headers: Record<string, string> = {};
  if (CFG.key) headers.Authorization = `Bearer ${CFG.key}`;
  const sep = CFG.url.includes('?') ? '&' : '?';
  const url = `${CFG.url}${sep}date_from=${fromDate}&date_to=${toDate}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`مصدر المباريات استجاب برمز ${res.status}`);
  const json: unknown = await res.json();
  return mapFixturesJson(json);
}

/**
 * تحويل JSON الوارد من الـAPI إلى قائمة مباريات موحّدة.
 * التنسيق الافتراضي المتوقع (عدّل الحقول لتطابق الـAPI الفعلي عند توفّره):
 *   { "matches": [ { "match_date": "2026-09-28", "time": "21:00", "league": "الدوري الإنجليزي",
 *                    "home": "ليفربول", "away": "آرسنال", "home_short": "ل", "away_short": "أ",
 *                    "points": 3, "featured": false, "external_id": "epl-123-456" } ] }
 */
export function mapFixturesJson(json: unknown): Fixture[] {
  const list: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray((json as Record<string, unknown> | null)?.matches)
      ? ((json as Record<string, unknown>).matches as unknown[])
      : [];
  const out: Fixture[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const home = String(r.home ?? r.home_team ?? '').trim();
    const away = String(r.away ?? r.away_team ?? '').trim();
    const matchDate = String(r.match_date ?? r.date ?? r.kickoff ?? r.start_date ?? '').trim().slice(0, 10);
    if (!home || !away || matchDate.length !== 10) continue;
    out.push({
      matchDate,
      time: String(r.time ?? r.time_utc ?? r.kickoff_time ?? '21:00').trim().slice(0, 5),
      league: String(r.league ?? r.competition ?? r.tournament ?? 'دوري غير محدد').trim() || 'دوري غير محدد',
      home,
      away,
      homeShort: String(r.home_short ?? '').trim() || home.slice(0, 2),
      awayShort: String(r.away_short ?? '').trim() || away.slice(0, 2),
      points: Number(r.points ?? 3) || 3,
      featured: Boolean(r.featured ?? false),
      externalId: r.external_id ? String(r.external_id) : undefined,
    });
  }
  return out;
}