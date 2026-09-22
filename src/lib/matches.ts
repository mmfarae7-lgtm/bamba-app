import { useEffect, useState } from 'react';
import { matches as staticMatches } from '../data';
import { supabase } from './supabase';
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
};

/** جلب مباريات اليوم الديناميكية (التي ينشئها المشرف/السوبر أدمن) من قاعدة البيانات. */
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
  }));
}

/** القائمة الكاملة = الثابتة + الديناميكية (أرقام الديناميكية تبدأ من 1000 فلا تتعارض). */
export async function loadAllMatches(): Promise<Match[]> {
  const dynamic = await loadDynamicMatches();
  return [...staticMatches, ...dynamic];
}

/** خطّاف يعيد قائمة المباريات الكاملة (تظهر المباريات الجديدة فور إنشائها من اللوحة). */
export function useMatches(): { matches: Match[]; ready: boolean } {
  const [matches, setMatches] = useState<Match[]>(staticMatches);
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