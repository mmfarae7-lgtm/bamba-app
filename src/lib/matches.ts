import { useEffect, useState } from 'react';
import { matches as staticMatches } from '../data';
import { supabase } from './supabase';
import { fixturesApiConfigured } from './fixtures';
import type { Match, MatchStatus } from '../types';

type AdminMatchRow = {
  id: number;
  league: string;
  home: string;
  away: string;
  home_short: string;
  away_short: string;
  time: string;
  points: number;
  featured: boolean;
  status: string;
  match_date: string;
  external_id: string | null;
};

/** جلب مباريات اليوم الديناميكية (التي ينشئها المشرف/السوبر أدمن أو تُزامن من الـAPI) من قاعدة البيانات. */
export async function loadDynamicMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from('admin_matches')
    .select('*')
    .order('match_date', { ascending: true })
    .order('time', { ascending: true });
  if (error || !data) return [];
  return (data as AdminMatchRow[]).map((r) => ({
    id: r.id,
    league: r.league,
    home: r.home,
    away: r.away,
    homeShort: r.home_short,
    awayShort: r.away_short,
    time: r.time,
    points: r.points,
    featured: r.featured,
    status: (r.status === 'live' || r.status === 'finished' ? r.status : 'upcoming') as MatchStatus,
    matchDate: r.match_date,
    externalId: r.external_id ?? undefined,
  }));
}

/**
 * القائمة الكاملة:
 * - عند ربط مصدر الـAPI الفعلي (VITE_FIXTURES_API_URL) تُلغى المباريات الثابتة نهائياً
 *   ويعمل التطبيق كاملاً على المباريات الحقيقية المُزامنة في القاعدة.
 * - قبل الربط: تظهر المباريات الثابتة معتمدةً بشارة «تجريبية» مؤقتاً حتى لا يخلو التطبيق.
 * الأرقام الديناميكية تبدأ من 1000 فلا تتعارض مع الثابتة.
 */
export async function loadAllMatches(): Promise<Match[]> {
  const dynamic = await loadDynamicMatches();
  if (fixturesApiConfigured) return dynamic;
  return [...staticMatches.map((m) => ({ ...m, demo: true })), ...dynamic];
}

/** توزيع تجريبي ثابت: أي يوم تعرض له المباراة الثابتة (بالنسبة ليوم اليوم) — تُستبدل بالبيانات الحقيقية لاحقاً */
export const MATCH_DAY_OFFSET: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: -1, 5: -2, 6: -1, 7: 0 };

export const toIsoLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * نفس قاعدة قائمة المباريات الرئيسية (الصفحة الرئيسية):
 * المباريات الديناميكية (matchDate) بتاريخها الفعلي، والثابتة التجريبية بموزّع الأيام المؤقت.
 * ضمانًا أن الحلبات والتطبيق الرئيسي يعرضان نفس قائمة المباريات تماماً.
 */
export function matchesForDay(all: Match[], iso: string): Match[] {
  const [y, m, d] = iso.split('-').map(Number);
  const selected = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const offset = Math.round((selected.getTime() - today.getTime()) / 86400000);
  return all.filter((m) => (m.matchDate ? m.matchDate === iso : (MATCH_DAY_OFFSET[m.id] ?? 0) === offset));
}

/** خطّاف يعيد قائمة المباريات الكاملة (تظهر المباريات الجديدة فور إنشائها/مزامنتها من اللوحة). */
export function useMatches(): { matches: Match[]; ready: boolean } {
  const [matches, setMatches] = useState<Match[]>(staticMatches.map((m) => ({ ...m, demo: true })));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void loadAllMatches().then((all) => {
      if (mounted) {
        setMatches(all);
        setReady(true);
      }
    });
    return () => { mounted = false; };
  }, []);
  return { matches, ready };
}