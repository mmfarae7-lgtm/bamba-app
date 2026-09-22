export type Tab = 'matches' | 'leagues' | 'ranking' | 'challenges';
export type AuthStep = 'language' | 'login' | 'signup' | 'app';
export type Page = 'main' | 'matchDetails' | 'leagueDetails' | 'profile' | 'store' | 'coach' | 'challengeArena' | 'challengeQuiz' | 'challengeChampions' | 'challengeCoach' | 'challengeStore' | 'settings' | 'admin' | 'earn' | 'earnQuiz';

export type MatchStatus = 'upcoming' | 'live' | 'finished';

export interface Match {
  id: number;
  league: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  time: string;
  points: number;
  featured?: boolean;
  status: MatchStatus;
  result?: string;
  homeGoals?: number;
  awayGoals?: number;
  correctPct?: number;
  wrongPct?: number;
  /** التاريخ الفعلي للمباراة بصيغة YYYY-MM-DD (للمباريات الحقيقية/الديناميكية من اللوحة والـAPI) */
  matchDate?: string;
  /** مباراة تجريبية ثابتة — تظهر مؤقتاً حتى ربط مصدر الـAPI الفعلي */
  demo?: boolean;
  /** معرّف المباراة لدى مصدر الـAPI الخارجي (لمنع التكرار) */
  externalId?: string;
}

export interface TeamStanding {
  pos: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gd: number;
  pts: number;
}

export interface Scorer {
  rank: number;
  name: string;
  team: string;
  goals: number;
}

export interface LeagueGroup {
  title: string;
  items: string[];
}

export interface Challenge {
  title: string;
  text: string;
  icon: string;
  color: string;
  page: string;
}

export interface Player {
  id: number;
  name: string;
  team: string;
  position: string;
  price: number;
  marketValue: string;
  owned?: boolean;
}
