import { supabase } from './supabase';

// ===== أنواع الحلبات =====
export type ArenaInfo = {
  id: string;
  name: string;
  category: string;
  league_filter: string;
  code: string;
  owner_id: string;
  owner_username: string;
  members: number;
  is_owner: boolean;
  created_at: string;
};

export type ArenaLeaderRow = {
  user_id: string;
  username: string;
  predicted: number;
  points: number;
};

export type ArenaPredictionRow = {
  match_id: number;
  home_score: number;
  away_score: number;
  scored: boolean;
  points_awarded: number;
};

// ===== عمليات الحلبات =====
export async function fetchMyArenas(): Promise<ArenaInfo[]> {
  const { data, error } = await supabase.rpc('get_my_arenas');
  if (error || !data) return [];
  return data as ArenaInfo[];
}

export async function createArena(
  name: string,
  category: string,
  league: string,
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_arena', { p_name: name, p_category: category, p_league: league });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok: boolean; code?: string; error?: string };
  if (!res.ok) return { ok: false, error: res.error ?? 'تعذر إنشاء الحلبة' };
  return { ok: true, code: res.code };
}

export async function joinArena(code: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('join_arena', { p_code: code });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok: boolean; error?: string };
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'تعذر الانضمام' };
}

export async function submitArenaPrediction(
  arenaId: string,
  matchId: number,
  home: number,
  away: number,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('submit_arena_prediction', {
    p_arena_id: arenaId,
    p_match_id: matchId,
    p_home: home,
    p_away: away,
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok: boolean; error?: string };
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'تعذر حفظ التوقع' };
}

export async function fetchArenaLeaderboard(arenaId: string): Promise<ArenaLeaderRow[]> {
  const { data, error } = await supabase.rpc('get_arena_leaderboard', { p_arena_id: arenaId });
  if (error || !data) return [];
  return data as ArenaLeaderRow[];
}

export async function fetchMyArenaPredictions(arenaId: string): Promise<ArenaPredictionRow[]> {
  const { data, error } = await supabase.rpc('get_my_arena_predictions', { p_arena_id: arenaId });
  if (error || !data) return [];
  return data as ArenaPredictionRow[];
}