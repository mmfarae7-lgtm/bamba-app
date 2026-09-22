import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Copy,
  Crown,
  Flame,
  Gift,
  Loader2,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Trophy,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { challenges } from './data';
import { loadStore, makeCouponCode, storeFileUrl } from './lib/store';
import type { StorePartner, StoreProduct } from './lib/store';
import { PageHeading, SubPageHeader, PredictionModal } from './components';
import { useMatches, matchesForDay, toIsoLocalDate } from './lib/matches';
import {
  fetchMyArenas,
  createArena,
  joinArena,
  submitArenaPrediction,
  fetchArenaLeaderboard,
  fetchMyArenaPredictions,
} from './lib/arenas';
import type { ArenaInfo, ArenaLeaderRow, ArenaPredictionRow } from './lib/arenas';
import type { Challenge, Match } from './types';
import { supabase } from './lib/supabase';

const iconMap: Record<string, typeof Users> = {
  Users, CircleHelp, Crown, ShieldCheck, ShoppingBag,
};

export function ChallengesHub({ onChallengeClick, onRewards }: { onChallengeClick: (c: Challenge) => void; onRewards: () => void }) {
  const coachChallenge = challenges.find((c) => c.title === 'أنت المدرب') ?? challenges[3];
  return (
    <div className="page challenges-page">
      <PageHeading eyebrow="استمتع بالمنافسة" title="التحديات" action={<button className="outline-button" onClick={onRewards}><Gift size={16} /> المكافآت</button>} />
      <div className="challenge-banner">
        <div>
          <span>جاهز للمنافسة؟</span>
          <h2>إذا كنت من عشاق التحديات المثيرة، هنا مكانك</h2>
          <p>اختر تحديك المفضل وابدأ التحدي واربح بمبات.</p>
        </div>
        <Flame size={80} />
      </div>
      <div className="challenge-tiles">
        {challenges.map((c) => {
          const Icon = iconMap[c.icon] ?? Users;
          return (
            <button className={`challenge-tile ${c.color}`} key={c.title} onClick={() => onChallengeClick(c)}>
              <span className="tile-icon"><Icon size={28} /></span>
              <b>{c.title}</b>
            </button>
          );
        })}
      </div>
      <div className="coach-card">
        <div className="coach-icon"><ShieldCheck size={31} /></div>
        <div><span>الأكثر إثارة</span><h3>كوّن فريق أحلامك في «أنت المدرب»</h3><p>اختر 15 لاعباً وتابع أداءهم أسبوعياً.</p></div>
        <button onClick={() => onChallengeClick(coachChallenge)}>ابدأ الآن <ArrowLeft size={16} /></button>
      </div>
    </div>
  );
}

const ARENA_CATEGORIES = ['أصدقائي', 'عائلتي', 'مشجعو البطولة'];
const ARENA_LEAGUES = ['الدوري الإنجليزي', 'الدوري الإسباني', 'الدوري الإيطالي', 'الدوري الألماني', 'الدوري الفرنسي', 'دوري أبطال أوروبا', 'دوري روشن السعودي', 'كل البطولات'];

/** حلبة التوقعات — نموذج مصغّر من نظام التوقعات العام داخل مجموعة مشتركين. */
export function ChallengeArenaPage({ onBack, onRewards, userId }: { onBack: () => void; onRewards: () => void; userId?: string }) {
  const [arenas, setArenas] = useState<ArenaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [arenaName, setArenaName] = useState('');
  const [arenaCategory, setArenaCategory] = useState(ARENA_CATEGORIES[0]);
  const [arenaLeague, setArenaLeague] = useState(ARENA_LEAGUES[0]);
  const [joinCode, setJoinCode] = useState('');
  const [arenaMsg, setArenaMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // عرض تفاصيل حلبة — يُدار داخلياً دون تغيير التوجيه
  const [selected, setSelected] = useState<ArenaInfo | null>(null);

  const flash = (msg: string) => { setArenaMsg(msg); window.setTimeout(() => setArenaMsg(''), 3200); };

  const refresh = async () => {
    const list = await fetchMyArenas();
    setArenas(list);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const handleCreate = async () => {
    setBusy(true);
    const res = await createArena(arenaName, arenaCategory, arenaLeague);
    setBusy(false);
    if (!res.ok) {
      flash(res.error === 'ONE_ARENA_ONLY' ? 'يحق لكل عضو إنشاء حلبة واحدة فقط' : (res.error ?? 'تعذر إنشاء الحلبة'));
      return;
    }
    setShowCreate(false);
    setArenaName('');
    await refresh();
    flash(`تم إنشاء حلبتك ✓ كود الدعوة: ${res.code}`);
  };

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) { flash('أدخل كود الحلبة أولاً'); return; }
    setBusy(true);
    const res = await joinArena(code);
    setBusy(false);
    setJoinCode('');
    if (!res.ok) {
      const msgMap: Record<string, string> = {
        NOT_FOUND: `لم يتم العثور على حلبة بالكود ${code}`,
        OWN_ARENA: 'هذه حلبتك أنت — أدخل كود حلبة أخرى',
        ALREADY_MEMBER: 'أنت عضو في هذه الحلبة بالفعل',
        MEMBER_LIMIT: 'يمكنك الاشتراك في حلبتين كحد أقصى',
      };
      flash(msgMap[res.error ?? ''] ?? 'تعذر الانضمام للحلبة');
      return;
    }
    flash('انضممت إلى الحلبة بنجاح 🎉');
    await refresh();
  };

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); } catch { /* تجاهل */ }
    flash(`نُسخ الكود ${code}`);
  };

  if (selected) {
    return (
      <ArenaDetailPage
        arena={selected}
        userId={userId ?? ''}
        onBack={() => { setSelected(null); void refresh(); }}
        onRewards={onRewards}
      />
    );
  }

  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="حلبة التوقعات" onBack={onBack} />
      <div className="challenge-intro">
        <Users size={40} />
        <div>
          <h2>أنشئ حلبتك الخاصة</h2>
          <p>حلبة = نسخة مصغّرة من نظام التوقعات لمجموعتك: من ينشئ الحلبة هو المسؤول، وتظهر فيها مباريات التوقع نفسها، ونقاط الأعضاء تُحسب داخل الحلبة فقط.</p>
        </div>
      </div>
      <div className="arena-rules">
        <div className="rule-card"><span>1</span><b>إنشاء حلبة واحدة</b><small>يحق لكل عضو إنشاء حلبة توقعات واحدة</small></div>
        <div className="rule-card"><span>2</span><b>الاشتراك في حلبتين</b><small>يمكنك الاشتراك في حلبتين كحد أقصى</small></div>
        <div className="rule-card"><span>3</span><b>دعوة بالكود</b><small>ادعُ أي عضو عبر كود رقمي فريد</small></div>
      </div>
      <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={18} /> أنشئ حلبتك الآن</button>

      <div className="join-arena">
        <h3>انضم إلى حلبة عبر الكود</h3>
        <div className="join-arena-row">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="أدخل الكود المكوّن من 4 أرقام" inputMode="numeric" data-testid="arena-join-code" />
          <button className="outline-button" disabled={busy} onClick={() => void handleJoin()}>انضمام <ArrowLeft size={16} /></button>
        </div>
      </div>
      {arenaMsg && <div className="arena-msg" data-testid="arena-msg">{arenaMsg}</div>}

      <div className="arena-list">
        <h3>حلباتي <small>({arenas.length})</small></h3>
        {loading ? (
          <div className="arena-loading"><Loader2 size={20} className="spin" /><p>جاري تحميل حلباتك...</p></div>
        ) : arenas.length === 0 ? (
          <div className="arena-empty">لا توجد حلبات بعد — أنشئ حلبتك الأولى أو انضم بكود.</div>
        ) : (
          arenas.map((a) => (
            <div className="arena-card" key={a.id}>
              <button className="arena-info arena-open" onClick={() => setSelected(a)} data-testid={`arena-open-${a.code}`}>
                <b>{a.name}</b>
                <small>{a.members} أعضاء • {a.league_filter} {a.is_owner ? '• أنت المسؤول' : `• مسؤول الحلبة: ${a.owner_username}`}</small>
              </button>
              <button className="arena-code" onClick={() => copyCode(a.code)}><Copy size={14} /> كود: {a.code}</button>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreate(false)}><X size={18} /></button>
            <h2>إنشاء حلبة جديدة</h2>
            <div className="form-grid">
              <label className="full-label">اسم الحلبة<input value={arenaName} onChange={(e) => setArenaName(e.target.value)} placeholder="مثال: حلبة الأصدقاء" /></label>
              <label className="full-label">فئة الحلبة
                <div className="category-chips">
                  {ARENA_CATEGORIES.map((c) => (
                    <button key={c} type="button" className={arenaCategory === c ? 'selected' : ''} onClick={() => setArenaCategory(c)}>{c}</button>
                  ))}
                </div>
              </label>
              <label className="full-label">البطولة<select value={arenaLeague} onChange={(e) => setArenaLeague(e.target.value)}>{ARENA_LEAGUES.map((l) => <option key={l}>{l}</option>)}</select></label>
            </div>
            <p className="arena-code-note">أنت المسؤول عن هذه الحلبة — وعند إنشائها سيظهر لك كود دعوة من 4 أرقام ترسله لأصدقائك، وتظهر فيها مباريات التوقع نفسها.</p>
            <button className="primary-button" disabled={busy} onClick={() => void handleCreate()}>{busy ? <><Loader2 size={17} className="spin" /> جارٍ الإنشاء...</> : <>إنشاء الحلبة <ArrowLeft size={18} /></>}</button>
          </div>
        </div>
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}

/** داخل الحلبة: المباريات + التوقعات + الترتيب. */
function ArenaDetailPage({ arena, userId, onBack, onRewards }: { arena: ArenaInfo; userId: string; onBack: () => void; onRewards: () => void }) {
  const { matches } = useMatches();
  const [tab, setTab] = useState<'matches' | 'ranking'>('matches');
  const [myPreds, setMyPreds] = useState<Record<number, string>>({});
  const [leader, setLeader] = useState<ArenaLeaderRow[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [predictMatch, setPredictMatch] = useState<Match | null>(null);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3000); };

  useEffect(() => { void (async () => { setRankingLoading(true); const [preds, rank] = await Promise.all([fetchMyArenaPredictions(arena.id), fetchArenaLeaderboard(arena.id)]); setRankingLoading(false); setMyPreds(mapPreds(preds)); setLeader(rank); })(); }, [arena.id]);

  // نفس قائمة المباريات الرئيسية تماماً (يوم اليوم) ثم فتيل البطولة — لا مباريات «زائدة»
  const arenaMatches = matchesForDay(matches, toIsoLocalDate(new Date()))
    .filter((m) => arena.league_filter === 'كل البطولات' || m.league === arena.league_filter);

  const saveArenaPrediction = async (matchId: number, prediction: string) => {
    const [h, a] = prediction.split('-').map((n) => Number(n));
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    const res = await submitArenaPrediction(arena.id, matchId, h, a);
    if (!res.ok) {
      flash(res.error === 'NOT_MEMBER' ? 'يجب أن تكون عضواً في الحلبة للتوقع' : res.error === 'MATCH_SCORED' ? 'انتهى هذا التوقع — تم اعتماد النتيجة' : 'تعذر حفظ توقعك داخل الحلبة');
      setPredictMatch(null);
      return;
    }
    setMyPreds((prev) => ({ ...prev, [matchId]: prediction }));
    setPredictMatch(null);
    flash('تم حفظ توقعك داخل الحلبة ✓');
  };

  const rankMe = (uid: string) => leader.findIndex((r) => r.user_id === uid) + 1;

  return (
    <div className="page challenge-sub-page arena-detail-page">
      <SubPageHeader title={arena.name || 'الحلبة'} onBack={onBack} />
      <div className="arena-detail-head">
        <div className="arena-detail-top">
          <span className={`arena-owner-badge ${arena.is_owner ? 'owner' : ''}`}>{arena.is_owner ? <><ShieldCheck size={14} /> أنت المسؤول</> : <><Users size={14} /> المسؤول: {arena.owner_username}</>}</span>
          <button className="arena-code arena-code-big" onClick={() => { navigator.clipboard?.writeText(arena.code).catch(() => undefined); flash('نُسخ كود الدعوة ✓'); }}><Copy size={14} /> دعوة: {arena.code}</button>
        </div>
        <div className="arena-detail-meta">
          <span>{arena.members} أعضاء</span>
          <span>{arena.category}</span>
          <span>{arena.league_filter === 'كل البطولات' ? 'كل البطولات' : `دوري: ${arena.league_filter}`}</span>
        </div>
        <p className="arena-detail-note">نموذج مصغّر من نظام التوقعات — لكل عضو توقعه داخل الحلبة، والنقاط تُحسب هنا فقط (نتيجة صحيحة 3 / نارية 5، فائز 1 / نارية 2).</p>
      </div>

      <div className="arena-detail-tabs">
        <button className={tab === 'matches' ? 'active' : ''} onClick={() => setTab('matches')}><Trophy size={16} /> مباريات التوقع ({arenaMatches.length})</button>
        <button className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}><Crown size={16} /> ترتيب الحلبة</button>
      </div>

      {msg && <div className="arena-msg" data-testid="arena-detail-msg">{msg}</div>}

      {tab === 'matches' ? (
        arenaMatches.length === 0 ? (
          <div className="arena-empty">لا توجد مباريات {arena.league_filter === 'كل البطولات' ? 'لهذا اليوم' : `في ${arena.league_filter} لهذا اليوم`} — اختر يوماً آخر من قائمة المباريات الرئيسية.</div>
        ) : (
          <div className="arena-matches-list">
            {arenaMatches.map((m) => {
              const mine = myPreds[m.id];
              const finished = m.status === 'finished';
              return (
                <div className="arena-match" key={m.id}>
                  <div className="arena-match-meta">
                    <span>{m.league}{m.demo ? ' · تجريبية' : ''}</span>
                    <span className={m.featured ? 'arena-featured' : ''}>{m.featured ? <><Zap size={11} /> نارية {m.points} نقاط</> : <>{m.points} نقاط</>}</span>
                  </div>
                  <div className="arena-match-teams">
                    <div className="arena-match-team"><span className="team-logo home-logo">{m.homeShort}</span><b>{m.home}</b></div>
                    <div className="arena-match-vs">
                      {finished ? <strong className="final-score">{m.result}</strong> : mine ? <strong className="arena-mine">{mine}</strong> : <span>VS</span>}
                      <small>{finished ? 'انتهت' : m.time}</small>
                    </div>
                    <div className="arena-match-team"><span className="team-logo away-logo">{m.awayShort}</span><b>{m.away}</b></div>
                  </div>
                  <div className="arena-match-foot">
                    {finished ? (
                      <span className="arena-finished-tag">تم الاعتماد{mine ? ` — توقعك ${mine}` : ''}</span>
                    ) : (
                      <button className="arena-predict-btn" onClick={() => setPredictMatch(m)}>
                        {mine ? 'تعديل توقعك' : 'توقع الآن'} <ArrowLeft size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        rankingLoading ? (
          <div className="arena-loading"><Loader2 size={22} className="spin" /><p>جاري حساب ترتيب الحلبة...</p></div>
        ) : leader.length === 0 ? (
          <div className="arena-empty">لا يوجد أعضاء في التصنيف بعد — أول توقع يُنشئ التصنيف.</div>
        ) : (
          <div className="arena-rank-list">
            <div className="arena-rank-head"><span>#</span><span>العضو</span><span>توقعات</span><span>النقاط</span></div>
            {leader.map((row, i) => (
              <div className={`arena-rank-row ${row.user_id === userId ? 'me' : ''}`} key={row.user_id}>
                <span className={`arena-rank-pos ${i === 0 ? 'first' : ''}`}>{i + 1}</span>
                <span className="arena-rank-user">{row.user_id === userId ? <ShieldCheck size={13} /> : null}{row.username}{row.user_id === arena.owner_id ? <small className="arena-owner-flag">مسؤول</small> : null}</span>
                <span>{row.predicted}</span>
                <span className="arena-rank-pts"><Zap size={13} /> {row.points}</span>
              </div>
            ))}
            {userId && rankMe(userId) > 0 && leader.length > 0 && <div className="arena-rank-me-note">موقعك الحالي في الحلبة: <b>#{rankMe(userId)}</b> من {leader.length}</div>}
          </div>
        )
      )}

      {predictMatch && (
        <PredictionModal
          match={predictMatch}
          existing={myPreds[predictMatch.id]}
          onClose={() => setPredictMatch(null)}
          onSave={(matchId, prediction) => void saveArenaPrediction(matchId, prediction)}
        />
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}

function mapPreds(rows: ArenaPredictionRow[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const r of rows) map[r.match_id] = `${r.home_score}-${r.away_score}`;
  return map;
}

// ===== جاوب واكسب — أسئلة عشوائية من قاعدة البيانات (تختلف من مشترك لآخر) =====
type DbQuizQuestion = { id: number; category: string; question: string; options: string[] };

export function ChallengeQuizPage({ onBack, onReward }: { onBack: () => void; onReward: (amount: number) => void }) {
  const [questions, setQuestions] = useState<DbQuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<{ correct: boolean; earned: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  const [summary, setSummary] = useState({ correct: 0, earned: 0 });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_quiz_questions', { p_count: 6 });
      if (!mounted) return;
      if (rpcError || !data) setError('تعذر تحميل الأسئلة. تحقق من الاتصال وحاول مجدداً.');
      else setQuestions(data as DbQuizQuestion[]);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const answer = async (optionIndex: number) => {
    if (submitting || selected !== null) return;
    setSelected(optionIndex);
    setSubmitting(true);
    const q = questions[index];
    const { data, error: rpcError } = await supabase.rpc('answer_quiz_question', { p_question_id: q.id, p_answer_index: optionIndex, p_reward: 5 });
    setSubmitting(false);
    if (rpcError || !data) { setError('تعذر تسجيل الإجابة. حاول مجدداً.'); setSelected(null); return; }
    const res = data as { correct: boolean; earned?: number };
    setAnswered({ correct: res.correct, earned: res.earned ?? 0 });
    setSummary((s) => ({ correct: s.correct + (res.correct ? 1 : 0), earned: s.earned + (res.earned ?? 0) }));
  };

  const next = () => {
    if (index + 1 >= questions.length) setFinished(true);
    else { setIndex((i) => i + 1); setSelected(null); setAnswered(null); }
  };

  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="جاوب واكسب" onBack={onBack} />

      {error && <p className="login-error">{error}</p>}

      {loading ? (
        <div className="quiz-loading"><Loader2 size={26} className="spin" /><p>جاري تحضير أسئلتك المخصصة...</p></div>
      ) : finished ? (
        <div className="quiz-result" data-testid="quiz-result">
          <Trophy size={50} />
          <h2>أحسنت!</h2>
          <p>أجبت بشكل صحيح على {summary.correct} من {questions.length} أسئلة</p>
          <span className="quiz-reward"><WalletCards size={18} /> +{summary.earned} بمبة</span>
          <p className="quiz-done-note"><ShieldCheck size={14} /> الأسئلة تختلف من مشترك لآخر، وكل سؤال يُحتسب مرة واحدة فقط.</p>
          <button className="primary-button" onClick={() => onReward(summary.earned)}>استلام المكافأة <ArrowLeft size={18} /></button>
        </div>
      ) : questions.length === 0 ? (
        <div className="quiz-result"><p>لا توجد أسئلة متاحة حالياً — عد لاحقاً.</p></div>
      ) : (
        <div className="quiz-card">
          <div className="quiz-progress">
            <div className="quiz-progress-bar"><div style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
            <span>سؤال {index + 1} من {questions.length} • {questions[index].category}</span>
          </div>
          <h3>{questions[index].question}</h3>
          <div className="quiz-options">
            {questions[index].options.map((opt, i) => {
              let cls = 'quiz-option';
              if (answered) {
                if (i === selected && answered.correct) cls += ' correct';
                else if (i === selected) cls += ' wrong';
              }
              return (
                <button key={i} className={cls} onClick={() => void answer(i)} disabled={selected !== null || submitting}>
                  <span className="quiz-letter">{String.fromCharCode(65 + i)}</span> {opt}
                  {answered && i === selected && (answered.correct ? <CheckCircle2 size={18} className="quiz-mark ok" /> : <X size={18} className="quiz-mark no" />)}
                </button>
              );
            })}
          </div>
          {answered && (
            <div className={`quiz-feedback ${answered.correct ? 'good' : 'bad'}`}>
              {answered.correct ? <><CheckCircle2 size={15} /> إجابة صحيحة! +{answered.earned} بمبة{answered.earned === 0 ? ' (حصلت عليها سابقاً)' : ''}</> : 'إجابة خاطئة — لا تُخصم من رصيدك'}
            </div>
          )}
          {answered && (
            <button className="primary-button quiz-next" onClick={next}>{index + 1 >= questions.length ? 'عرض النتيجة' : 'السؤال التالي'} <ArrowLeft size={18} /></button>
          )}
        </div>
      )}
      <button className="rewards-fab" onClick={() => onReward(0)}><Gift size={20} /></button>
    </div>
  );
}

// ===== تحدي الأبطال — الخمس الكبرى + دوري الأبطال =====
type ChampionsGroup = { league: string; icon: typeof Trophy; items: Array<{ label: string; icon: typeof Star; options: string[] }> };

const CHAMPIONS_GROUPS: ChampionsGroup[] = [
  {
    league: 'الدوري الإنجليزي', icon: Trophy,
    items: [
      { label: 'بطل الدوري الإنجليزي', icon: Trophy, options: ['مانشستر سيتي', 'ليفربول', 'أرسنال', 'تشيلسي', 'مانشستر يونايتد', 'نيوكاسل', 'توتنهام', 'أستون فيلا'] },
      { label: 'هداف الموسم — الدوري الإنجليزي', icon: Star, options: ['محمد صلاح', 'إيرلينغ هالاند', 'ألكسندر إيزاك', 'كول بالمر', 'بوكايو ساكا', 'أولي واتكينز'] },
      { label: 'أفضل لاعب في الموسم — الدوري الإنجليزي', icon: Star, options: ['محمد صلاح', 'إيرلينغ هالاند', 'كول بالمر', 'بوكايو ساكا', 'مارتن أوديغارد', 'ديكلان رايس'] },
    ],
  },
  {
    league: 'الدوري الإسباني', icon: Trophy,
    items: [
      { label: 'بطل الدوري الإسباني', icon: Trophy, options: ['ريال مدريد', 'برشلونة', 'أتلتيكو مدريد', 'أثلتيك بلباو', 'ريال سوسيداد', 'ريال بيتيس', 'فياريال', 'جيرونا'] },
      { label: 'هداف الموسم — الدوري الإسباني', icon: Star, options: ['روبرت ليفاندوفسكي', 'كيليان مبابي', 'فينيسيوس جونيور', 'جود بيلينغهام', 'لامين يامال', 'أنطوان غريزمان'] },
      { label: 'أفضل لاعب في الموسم — الدوري الإسباني', icon: Star, options: ['لامين يامال', 'كيليان مبابي', 'فينيسيوس جونيور', 'جود بيلينغهام', 'بيدري', 'رافينها'] },
    ],
  },
  {
    league: 'الدوري الإيطالي', icon: Trophy,
    items: [
      { label: 'بطل الدوري الإيطالي', icon: Trophy, options: ['إنتر ميلان', 'ميلان', 'يوفنتوس', 'نابولي', 'أتالانتا', 'روما', 'لاتسيو', 'فيورنتينا'] },
      { label: 'هداف الموسم — الدوري الإيطالي', icon: Star, options: ['لاوتارو مارتينيز', 'دوشان فلاهوفيتش', 'ماركوس تورام', 'أديمولا لوكمان', 'فيكتور أوسيمين', 'باولو ديبالا'] },
      { label: 'أفضل لاعب في الموسم — الدوري الإيطالي', icon: Star, options: ['لاوتارو مارتينيز', 'نيكولو باريلا', 'هاكان تشالهان أوغلو', 'أديمولا لوكمان', 'رافائيل لياو', 'كريستيان بوليسيتش'] },
    ],
  },
  {
    league: 'الدوري الألماني', icon: Trophy,
    items: [
      { label: 'بطل الدوري الألماني', icon: Trophy, options: ['بايرن ميونخ', 'باير ليفركوزن', 'دورتموند', 'لايبزيغ', 'شتوتغارت', 'آينتراخت فرانكفورت', 'فولفسبورغ', 'غلادباخ'] },
      { label: 'هداف الموسم — البوندسليغا', icon: Star, options: ['هاري كين', 'فيكتور بونيفاس', 'لوي أوبيندا', 'سيرهو غيراسي', 'فلوريان فيرتز', 'جمال موسيالا'] },
      { label: 'أفضل لاعب في الموسم — البوندسليغا', icon: Star, options: ['فلوريان فيرتز', 'هاري كين', 'جمال موسيالا', 'مايكل أوليس', 'غرانيت تشاكا', 'بنيامين سيسكو'] },
    ],
  },
  {
    league: 'الدوري الفرنسي', icon: Trophy,
    items: [
      { label: 'بطل الدوري الفرنسي', icon: Trophy, options: ['باريس سان جيرمان', 'موناكو', 'مارسيليا', 'ليل', 'ليون', 'نيس', 'لانس', 'رين'] },
      { label: 'هداف الموسم — الدوري الفرنسي', icon: Star, options: ['عثمان ديمبيلي', 'ألكسندر لاكازيت', 'جوناثان ديفيد', 'برادلي باركولا', 'بيير إيميريك أوباميانغ', 'موسى ديمبيلي'] },
      { label: 'أفضل لاعب في الموسم — الدوري الفرنسي', icon: Star, options: ['عثمان ديمبيلي', 'أشرف حكيمي', 'فيتينيا', 'وارين زائير-إيمري', 'جوناثان ديفيد', 'برادلي باركولا'] },
    ],
  },
  {
    league: 'دوري أبطال أوروبا', icon: Crown,
    items: [
      { label: 'بطل دوري أبطال أوروبا', icon: Crown, options: ['ريال مدريد', 'برشلونة', 'مانشستر سيتي', 'بايرن ميونخ', 'ليفربول', 'إنتر ميلان', 'باريس سان جيرمان', 'أرسنال'] },
      { label: 'هداف الموسم — دوري الأبطال', icon: Star, options: ['رافينها', 'هاري كين', 'روبرت ليفاندوفسكي', 'عثمان ديمبيلي', 'كيليان مبابي', 'إيرلينغ هالاند'] },
      { label: 'أفضل لاعب في الموسم — دوري الأبطال', icon: Star, options: ['رافينها', 'لامين يامال', 'جود بيلينغهام', 'هاري كين', 'بيدري', 'فينيسيوس جونيور'] },
    ],
  },
];

export function ChallengeChampionsPage({ onBack, onRewards, onClaimed }: { onBack: () => void; onRewards: () => void; onClaimed?: () => void }) {
  const flat = CHAMPIONS_GROUPS.flatMap((g) => g.items);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [saved, setSaved] = useState(false);

  const pick = (qi: number, oi: number) => setPicks((prev) => ({ ...prev, [qi]: oi }));
  const allAnswered = Object.keys(picks).length === flat.length;
  const save = () => { if (allAnswered && !saved) { setSaved(true); onClaimed?.(); } };

  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="تحدي الأبطال" onBack={onBack} />
      <div className="challenge-intro">
        <Crown size={40} />
        <div><h2>توقع أبطال الموسم</h2><p>الدوريات الخمس الكبرى + دوري الأبطال: توقع البطل وهداف الموسم وأفضل لاعب لكل دوري، وفي نهاية الموسم أصحاب الإجابات الصحيحة يحصلون على بمبات.</p></div>
      </div>

      {CHAMPIONS_GROUPS.map((group, gi) => {
        const GroupIcon = group.icon;
        const offset = CHAMPIONS_GROUPS.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0);
        return (
          <section className="champions-league" key={group.league} data-testid={`champions-league-${gi}`}>
            <div className="champions-league-head"><GroupIcon size={18} /><h3>{group.league}</h3></div>
            <div className="champions-predictions">
              {group.items.map((p, ii) => {
                const qi = offset + ii;
                return (
                  <div className="champion-prediction" key={p.label}>
                    <div className="cp-header"><p.icon size={18} /> <b>{p.label}</b></div>
                    <div className="cp-options">
                      {p.options.map((o, oi) => (
                        <button key={o} className={picks[qi] === oi ? 'selected' : ''} onClick={() => pick(qi, oi)}>{o}</button>
                      ))}
                    </div>
                    {picks[qi] === undefined && <small className="cp-miss">لم تختر بعد</small>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {saved ? (
        <div className="champions-saved" data-testid="champions-saved">تم حفظ توقعاتك ✓ — ستُمنح بمبات أصحاب الإجابات الصحيحة في نهاية الموسم</div>
      ) : (
        <button className="primary-button" disabled={!allAnswered} onClick={save}>حفظ التوقعات <ArrowLeft size={18} /></button>
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}

export function ChallengeStorePage({ onBack, onRewards, balance }: { onBack: () => void; onRewards: () => void; balance?: number }) {
  const [tab, setTab] = useState<'products' | 'partners'>('partners');
  const [partners, setPartners] = useState<StorePartner[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [ready, setReady] = useState(false);
  const [coupon, setCoupon] = useState<{ partner: StorePartner; discount: number; code: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const store = await loadStore();
      if (!mounted) return;
      setPartners(store.partners);
      setProducts(store.products);
      setReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  const partnerOf = (product: StoreProduct) => partners.find((p) => p.id === product.partner_id) ?? partners[0];

  return (
    <div className="page challenge-sub-page store-page">
      <SubPageHeader title="متجر بمبا" onBack={onBack} />
      <div className="store-balance"><WalletCards size={24} /><div><span>رصيدك بالبمبات</span><b>{(balance ?? 1320).toLocaleString()} بمبة</b></div></div>
      <div className="store-offer">
        <ShoppingBag size={34} />
        <div><h2>قسائم خصم تصل إلى 70%</h2><p>استبدل بمباتك بقسائم شراء من محلات ومطاعم ومتاجر الشركاء.</p></div>
      </div>
      <div className="store-view-tabs">
        <button className={tab === 'partners' ? 'active' : ''} onClick={() => setTab('partners')}><Store size={16} /> الشركاء والقسائم</button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><ShoppingBag size={16} /> المنتجات</button>
      </div>

      {!ready ? <div className="store-loading">جاري تحميل المتجر...</div> : tab === 'partners' ? (
        <div className="partner-grid">
          {partners.map((partner) => (
            <div className="partner-card" key={partner.id}>
              {partner.logo_url ? (
                <img className="partner-logo" src={storeFileUrl(partner.logo_url) ?? ''} alt={partner.name} />
              ) : (
                <span className="partner-logo partner-logo-fallback"><Store size={26} /></span>
              )}
              <div className="partner-info"><b>{partner.name}</b><small>{partner.category}</small></div>
              <span className="coupon-badge">قسيمة خصم {partner.discount}%</span>
              <button className="store-buy" onClick={() => setCoupon({ partner, discount: partner.discount, code: makeCouponCode() })}>احصل على القسيمة</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="store-grid">
          {products.map((product) => {
            const partner = partnerOf(product);
            return (
              <div className="store-card" key={product.id}>
                <div className="store-badge">خصم {product.discount}%</div>
                {product.image_url ? (
                  <img className="store-img" src={storeFileUrl(product.image_url) ?? ''} alt={product.name} />
                ) : (
                  <div className="store-icon"><ShoppingBag size={28} /></div>
                )}
                <b>{product.name}</b>
                <small>{partner?.name ?? product.category} • {product.category}</small>
                <div className="store-cost"><Zap size={14} /> {product.price_bamba.toLocaleString()} بمبة</div>
                <button className="store-buy" onClick={() => setCoupon({ partner: partner ?? { id: '', name: product.category, category: 'متجر', description: null, logo_url: null, discount: product.discount, active: true, created_at: '' }, discount: product.discount, code: makeCouponCode() })}>استبدال بالنقاط</button>
              </div>
            );
          })}
        </div>
      )}

      {coupon && (
        <div className="modal-backdrop" onClick={() => setCoupon(null)}>
          <div className="modal coupon-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCoupon(null)}><X size={18} /></button>
            <h2>قسيمتك جاهزة 🎉</h2>
            <p className="coupon-sub">أبرزها عند الدفع في {coupon.partner.name}</p>
            <div className="coupon-card">
              <div className="coupon-partner">{coupon.partner.logo_url ? <img src={storeFileUrl(coupon.partner.logo_url) ?? ''} alt={coupon.partner.name} /> : <Store size={22} />}<b>{coupon.partner.name}</b></div>
              <span className="coupon-value">خصم {coupon.discount}%</span>
              <div className="coupon-code" dir="ltr" data-testid="coupon-code">{coupon.code}</div>
              <small>قسيمة خصم صالحة للاستخدام في المتجر • بمبة</small>
            </div>
            <button className="primary-button" onClick={() => { navigator.clipboard?.writeText(coupon.code).catch(() => undefined); setCoupon(null); }}>تم — نسخ الكود <CheckCircle2 size={18} /></button>
          </div>
        </div>
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}