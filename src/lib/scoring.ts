import { supabase } from './supabase';

// نظام النقاط — قواعد الاحتساب مطابقة لـ«آلية احتساب النقاط» في صفحة الترتيب:
//   1) توقع صحيح بالنتيجة (الأهداف): 3 نقاط — مباراة نارية: 5 نقاط
//   2) توقع صحيح للفائز/التعادل بدون أهداف: 1 نقطة — نارية: 2 نقطة
//   3) نتيجة نادرة (أقل من 10% من الأعضاء توقعوها): +1 نقطة إضافية
// الاحتساب الفعلي يتم في قاعدة البيانات (دالة score_match_points) — العميل يعرض النتائج فقط.

export type Outcome = '1' | 'X' | '2';

export const outcomeOf = (home: number, away: number): Outcome =>
  home > away ? '1' : home === away ? 'X' : '2';

export type StoredPrediction = {
  id: string;
  user_id: string;
  match_id: number;
  home_score: number;
  away_score: number;
  outcome: Outcome;
  prediction_result: string;
  points_awarded: number;
  scored: boolean;
  created_at: string;
};

/** حفظ/تعديل توقع العضو في قاعدة البيانات (توقع واحد لكل مباراة). */
export async function upsertPrediction(userId: string, matchId: number, home: number, away: number): Promise<boolean> {
  const { error } = await supabase.from('predictions').upsert(
    {
      user_id: userId,
      match_id: matchId,
      home_score: home,
      away_score: away,
      outcome: outcomeOf(home, away),
      prediction_result: `${home}-${away}`,
    },
    { onConflict: 'user_id,match_id' },
  );
  return !error;
}

/** جلب توقعات العضو من قاعدة البيانات. */
export async function fetchPredictions(userId: string): Promise<StoredPrediction[]> {
  const { data, error } = await supabase.from('predictions').select('*').eq('user_id', userId);
  if (error || !data) return [];
  return data as StoredPrediction[];
}

/** إحصاءات توقعات العضو (صحيحة / خاطئة / بانتظار النتيجة). */
export function statsFromPredictions(preds: StoredPrediction[]) {
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  let exact = 0;
  for (const p of preds) {
    if (!p.scored) { pending += 1; continue; }
    if (p.points_awarded > 0) {
      correct += 1;
      if (p.points_awarded >= 3) exact += 1; // توقع صحيح بالنتيجة (3 أو أكثر=ناري/نادر)
    } else {
      wrong += 1;
    }
  }
  return { total: preds.length, correct, wrong, pending, exact };
}

/** هل المباراة انتهت واعتُمدت نتيجتها؟ */
export async function fetchMatchScores(): Promise<Record<number, { home: number; away: number; isFixture: boolean }>> {
  const { data, error } = await supabase.from('match_final_scores').select('*');
  if (error || !data) return {};
  const map: Record<number, { home: number; away: number; isFixture: boolean }> = {};
  for (const row of data as Array<{ match_id: number; home_goals: number; away_goals: number; is_fixture: boolean }>) {
    map[row.match_id] = { home: row.home_goals, away: row.away_goals, isFixture: row.is_fixture };
  }
  return map;
}