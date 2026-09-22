import { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Crown, Gift, ListOrdered, Search, ShieldCheck, Star, WalletCards, X } from 'lucide-react';
import { players } from './data';
import { SubPageHeader } from './components';
import type { Player } from './types';

const MAX_PLAYERS = 15;
const MAX_PER_TEAM = 3;
const STARTING_BUDGET = 20000;

// ربط الفرق بدورياتها لاختيار «الدوري الذي يعجبك»
const TEAM_LEAGUE: Record<string, string> = {
  'مانشستر سيتي': 'الدوري الإنجليزي', 'ليفربول': 'الدوري الإنجليزي', 'أرسنال': 'الدوري الإنجليزي', 'تشيلسي': 'الدوري الإنجليزي',
  'توتنهام': 'الدوري الإنجليزي', 'مانشستر يونايتد': 'الدوري الإنجليزي', 'نيوكاسل': 'الدوري الإنجليزي', 'أستون فيلا': 'الدوري الإنجليزي',
  'ريال مدريد': 'الدوري الإسباني', 'برشلونة': 'الدوري الإسباني', 'أتلتيكو مدريد': 'الدوري الإسباني', 'أثلتيك بلباو': 'الدوري الإسباني',
  'ريال سوسيداد': 'الدوري الإسباني', 'ريال بيتيس': 'الدوري الإسباني', 'فياريال': 'الدوري الإسباني', 'إشبيلية': 'الدوري الإسباني',
  'إنتر ميلان': 'الدوري الإيطالي', 'ميلان': 'الدوري الإيطالي', 'يوفنتوس': 'الدوري الإيطالي', 'نابولي': 'الدوري الإيطالي',
  'روما': 'الدوري الإيطالي', 'أتالانتا': 'الدوري الإيطالي', 'فيورنتينا': 'الدوري الإيطالي', 'بيزا': 'الدوري الإيطالي',
  'بايرن ميونخ': 'الدوري الألماني', 'دورتموند': 'الدوري الألماني', 'باير ليفركوزن': 'الدوري الألماني', 'لايبزيغ': 'الدوري الألماني',
  'شتوتغارت': 'الدوري الألماني', 'آينتراخت فرانكفورت': 'الدوري الألماني',
  'باريس سان جيرمان': 'الدوري الفرنسي', 'موناكو': 'الدوري الفرنسي', 'مارسيليا': 'الدوري الفرنسي', 'ليون': 'الدوري الفرنسي',
  'ليل': 'الدوري الفرنسي', 'نيس': 'الدوري الفرنسي',
  'النصر': 'دوري روشن السعودي', 'الهلال': 'دوري روشن السعودي', 'الاتحاد': 'دوري روشن السعودي', 'الأهلي': 'دوري روشن السعودي',
};
const LEAGUES = [...new Set(players.map((p) => TEAM_LEAGUE[p.team] ?? 'أخرى'))];

// أفضل المدربين — بيانات تجريبية (اسم الفريق + اسم المدرب + النقاط)
const BEST_COACHES = [
  { team: 'أسود الخليج', coach: 'أبو خالد', points: 342 },
  { team: 'نسور الظل', coach: 'معتصم', points: 318 },
  { team: 'ريال المستوطنة', coach: 'اليامامة', points: 291 },
  { team: 'سوبر ستارز', coach: 'Nasser', points: 274 },
  { team: 'فيليز المدينة', coach: 'سلمان', points: 251 },
];

const SCORING_RULES: Array<{ label: string; pts: number; type?: 'pos' | 'neg' }> = [
  { label: 'تسجيل هدف', pts: 5 },
  { label: 'تمريرة حاسمة', pts: 3 },
  { label: 'شباك نظيفة للحارس', pts: 4 },
  { label: 'شباك نظيفة للمدافع', pts: 3 },
  { label: 'بطاقة صفراء', pts: -1, type: 'neg' },
  { label: 'بطاقة حمراء', pts: -3, type: 'neg' },
  { label: 'استقبال هدف فوق الحارس', pts: -1, type: 'neg' },
];

export function CoachPage({ onBack, onRewards }: { onBack: () => void; onRewards: () => void }) {
  const [owned, setOwned] = useState<number[]>([]);
  const [captain, setCaptain] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('الكل');
  const [leagueFilter, setLeagueFilter] = useState('الكل');
  const [showSquad, setShowSquad] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const ownedPlayers = owned.map((id) => players.find((p) => p.id === id)!).filter(Boolean);
  const spent = ownedPlayers.reduce((sum, p) => sum + p.price, 0);
  const remaining = STARTING_BUDGET - spent;
  const teamCounts: Record<string, number> = {};
  ownedPlayers.forEach((p) => { teamCounts[p.team] = (teamCounts[p.team] ?? 0) + 1; });

  const filtered = players.filter((p) => {
    const matchSearch = p.name.includes(search) || p.team.includes(search);
    const matchPos = posFilter === 'الكل' || p.position === posFilter;
    const matchLeague = leagueFilter === 'الكل' || (TEAM_LEAGUE[p.team] ?? 'أخرى') === leagueFilter;
    return matchSearch && matchPos && matchLeague;
  });

  const togglePlayer = (p: Player) => {
    if (owned.includes(p.id)) {
      setOwned(owned.filter((id) => id !== p.id));
      if (captain === p.id) setCaptain(null);
    } else {
      if (owned.length >= MAX_PLAYERS) return;
      if ((teamCounts[p.team] ?? 0) >= MAX_PER_TEAM) return;
      if (remaining < p.price) return;
      setOwned([...owned, p.id]);
    }
  };

  return (
    <div className="page coach-page">
      <SubPageHeader title="أنت المدرب" onBack={onBack} />
      <div className="coach-hero">
        <div className="coach-hero-icon"><ShieldCheck size={36} /></div>
        <div>
          <h2>كوّن فريق أحلامك</h2>
          <p>اختر 15 لاعباً، حدد الكابتن، وتابع أداءهم أسبوعياً</p>
        </div>
      </div>

      <div className="coach-league-pick">
        <label>اختر الدوري الذي يعجبك</label>
        <select value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)} data-testid="coach-league">
          <option>الكل</option>
          {LEAGUES.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>

      <div className="coach-budget-bar">
        <div className="budget-item"><WalletCards size={18} /><div><span>المتبقي</span><b>{remaining.toLocaleString()} بمبة</b></div></div>
        <div className="budget-item"><Star size={18} /><div><span>اللاعبون</span><b>{owned.length}/{MAX_PLAYERS}</b></div></div>
        <div className="budget-item"><Crown size={18} /><div><span>الكابتن</span><b>{captain !== null ? 'محدد' : 'غير محدد'}</b></div></div>
      </div>

      <button className="coach-info-toggle" onClick={() => setShowInfo((s) => !s)}>
        <CircleHelpIcon /> آلية تشكيل الفرق وحساب النقاط <ChevronDown size={16} className={showInfo ? 'rotated' : ''} />
      </button>
      {showInfo && (
        <div className="coach-info" data-testid="coach-info">
          <h4>آلية تشكيل الفرق</h4>
          <ol>
            <li>عند الدخول أول مرة يُمنح كل عضو <b>20,000 بمبة</b> مجاناً (لشراء اللاعبين فقط).</li>
            <li>أسعار اللاعبين بالبمبات حسب قيمتهم العالمية (مثال: قيمة 150 مليون = 1500 بمبة).</li>
            <li>يُسمح بـ <b>3 لاعبين فقط</b> من كل نادٍ.</li>
            <li>شراء <b>15 لاعباً</b> واختيار الكابتن منهم.</li>
            <li>تعديل <b>3 لاعبين</b> أسبوعياً: احذف 3 واشترِ 3 بدلاً منهم من رصيدك.</li>
          </ol>
          <h4>حساب النقاط (حسب الأداء الواقعي)</h4>
          <div className="scoring-rules">
            {SCORING_RULES.map((r) => (
              <div className={`rule-row ${r.type === 'neg' ? 'negative' : ''}`} key={r.label}>
                <span>{r.label}</span>
                <b>{r.pts > 0 ? `+${r.pts}` : r.pts} نقطة</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="coach-controls">
        <div className="coach-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن لاعب..." /></div>
        <div className="pos-filter">{['الكل', 'حارس', 'مدافع', 'وسط', 'جناح', 'مهاجم'].map((p) => <button key={p} className={posFilter === p ? 'active' : ''} onClick={() => setPosFilter(p)}>{p}</button>)}</div>
      </div>
      <div className="players-grid">
        {filtered.map((p) => {
          const isOwned = owned.includes(p.id);
          const teamFull = (teamCounts[p.team] ?? 0) >= MAX_PER_TEAM && !isOwned;
          const tooExpensive = remaining < p.price && !isOwned;
          const squadFull = owned.length >= MAX_PLAYERS && !isOwned;
          const disabled = (teamFull || tooExpensive || squadFull) && !isOwned;
          return (
            <div className={`player-card ${isOwned ? 'owned' : ''} ${disabled ? 'disabled' : ''}`} key={p.id}>
              <div className="player-pos-badge">{p.position}</div>
              <div className="player-main">
                <b>{p.name}</b>
                <small>{p.team} • {p.marketValue}</small>
              </div>
              <div className="player-price"><WalletCards size={14} /> {p.price}</div>
              <button className={`player-buy ${isOwned ? 'bought' : ''}`} disabled={disabled} onClick={() => togglePlayer(p)}>
                {isOwned ? <><Check size={16} /> مملوك</> : 'شراء'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="coach-bottom-bar">
        <button className="outline-button" onClick={() => setShowSquad(true)}>تشكيلتي ({owned.length})</button>
        <button className="primary-button" disabled={owned.length < MAX_PLAYERS}>حفظ التشكيلة <ArrowLeft size={18} /></button>
      </div>

      <div className="best-coaches">
        <h3><ListOrdered size={18} /> أفضل المدربين</h3>
        <p>ترتيب المدربين حسب مجموع النقاط المكتسبة من أداء لاعبيهم.</p>
        {BEST_COACHES.map((c, i) => (
          <div className="coach-rank-row" key={c.team}>
            <b className={i < 3 ? `top-${i + 1}` : ''}>{i + 1}</b>
            <div className="coach-rank-info"><b>{c.team}</b><small>المدرب: {c.coach}</small></div>
            <span className="coach-rank-pts">{c.points} <small>نقطة</small></span>
          </div>
        ))}
      </div>

      {showSquad && (
        <div className="modal-backdrop" onClick={() => setShowSquad(false)}>
          <div className="modal squad-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSquad(false)}><X size={18} /></button>
            <h2>تشكيلتي ({owned.length}/{MAX_PLAYERS})</h2>
            {owned.length === 0 ? (
              <div className="empty-squad"><ShieldCheck size={40} /><p>لم تختر أي لاعب بعد</p></div>
            ) : (
              <div className="squad-list">
                {ownedPlayers.map((p) => (
                  <div className="squad-row" key={p.id}>
                    <div className="squad-player"><b>{p.name}</b><small>{p.team} • {p.position}</small></div>
                    <button className={`captain-btn ${captain === p.id ? 'active' : ''}`} onClick={() => setCaptain(captain === p.id ? null : p.id)}>
                      {captain === p.id ? <><Crown size={14} /> كابتن</> : 'جعله كابتن'}
                    </button>
                    <button className="sell-btn" onClick={() => togglePlayer(p)}><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="squad-summary">
              <span>إجمالي الإنفاق: <b>{spent.toLocaleString()} بمبة</b></span>
              <span>المتبقي: <b>{remaining.toLocaleString()} بمبة</b></span>
            </div>
            <p className="squad-note">يمكنك تعديل 3 لاعبين أسبوعياً (حذف 3 وشراء 3 بدلاً منهم)</p>
          </div>
        </div>
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}

function CircleHelpIcon() {
  return <span className="coach-info-badge">؟</span>;
}