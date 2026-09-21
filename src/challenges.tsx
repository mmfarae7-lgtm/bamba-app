import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Copy,
  Crown,
  Flame,
  Gift,
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
import { challenges, quizQuestions } from './data';
import { loadStore, makeCouponCode, storeFileUrl } from './lib/store';
import type { StorePartner, StoreProduct } from './lib/store';
import { PageHeading, SubPageHeader } from './components';
import type { Challenge } from './types';

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

export function ChallengeArenaPage({ onBack, onRewards }: { onBack: () => void; onRewards: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [arenas, setArenas] = useState([
    { id: 1, name: 'حلبة الأصدقاء', members: 5, league: 'الدوري الإنجليزي', code: '4827' },
    { id: 2, name: 'عائلة بمبا', members: 8, league: 'كل البطولات', code: '1936' },
  ]);
  const [arenaName, setArenaName] = useState('');
  const [arenaCategory, setArenaCategory] = useState('أصدقائي');
  const [arenaLeague, setArenaLeague] = useState('الدوري الإنجليزي');
  const [joinCode, setJoinCode] = useState('');
  const [arenaMsg, setArenaMsg] = useState('');

  const flash = (msg: string) => { setArenaMsg(msg); window.setTimeout(() => setArenaMsg(''), 3000); };

  const createArena = () => {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const name = arenaName.trim() || `${arenaCategory} — ${arenaLeague}`;
    setArenas((list) => [...list, { id: Date.now(), name, members: 1, league: arenaLeague, code }]);
    setShowCreate(false);
    setArenaName('');
    flash(`تم إنشاء حلبتك ✓ كود الدعوة: ${code}`);
  };

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); } catch { /* تجاهل */ }
    flash(`نُسخ الكود ${code}`);
  };

  const joinArena = () => {
    const code = joinCode.trim();
    if (!code) { flash('أدخل كود الحلبة أولاً'); return; }
    if (arenas.some((a) => a.code === code)) {
      flash('انضممت إلى الحلبة بنجاح 🎉');
    } else {
      flash(`لم يتم العثور على حلبة بالكود ${code}`);
    }
    setJoinCode('');
  };

  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="حلبة التوقعات" onBack={onBack} />
      <div className="challenge-intro">
        <Users size={40} />
        <div>
          <h2>أنشئ حلبتك الخاصة</h2>
          <p>تحديات خاصة مع أصدقائك أو عائلتك أو مشجعي بطولتك المفضلة، وانضم لأي حلبة بكودها.</p>
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
          <button className="outline-button" onClick={joinArena}>انضمام <ArrowLeft size={16} /></button>
        </div>
      </div>
      {arenaMsg && <div className="arena-msg" data-testid="arena-msg">{arenaMsg}</div>}

      <div className="arena-list">
        <h3>حلباتي <small>({arenas.length})</small></h3>
        {arenas.map((a) => (
          <div className="arena-card" key={a.id}>
            <div className="arena-info"><b>{a.name}</b><small>{a.members} أعضاء • {a.league}</small></div>
            <button className="arena-code" onClick={() => copyCode(a.code)}><Copy size={14} /> كود: {a.code}</button>
          </div>
        ))}
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
              <label className="full-label">البطولة<select value={arenaLeague} onChange={(e) => setArenaLeague(e.target.value)}><option>الدوري الإنجليزي</option><option>الدوري الإسباني</option><option>دوري أبطال أوروبا</option><option>دوري روشن السعودي</option><option>كل البطولات</option></select></label>
            </div>
            <p className="arena-code-note">عند إنشاء الحلبة سيظهر لك كود دعوة من 4 أرقام ترسله لأصدقائك.</p>
            <button className="primary-button" onClick={createArena}>إنشاء الحلبة <ArrowLeft size={18} /></button>
          </div>
        </div>
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}

export function ChallengeQuizPage({ onBack, onReward }: { onBack: () => void; onReward: (amount: number) => void }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const q = quizQuestions[current];

  const answer = (idx: number) => {
    setSelected(idx);
    if (idx === q.answer) setScore((s) => s + 1);
    setTimeout(() => {
      if (current + 1 < quizQuestions.length) {
        setCurrent((c) => c + 1);
        setSelected(null);
      } else {
        setFinished(true);
      }
    }, 1200);
  };

  if (finished) {
    return (
      <div className="page challenge-sub-page">
        <SubPageHeader title="جاوب واكسب" onBack={onBack} />
        <div className="quiz-result">
          <Trophy size={50} />
          <h2>أحسنت!</h2>
          <p>أجبت بشكل صحيح على {score} من {quizQuestions.length} أسئلة</p>
          <span className="quiz-reward"><WalletCards size={18} /> +{score * 20} بمبة</span>
          <button className="primary-button" onClick={() => onReward(score * 20)}>استلام المكافأة <ArrowLeft size={18} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="جاوب واكسب" onBack={onBack} />
      <div className="quiz-progress">
        <div className="quiz-progress-bar"><div style={{ width: `${((current + 1) / quizQuestions.length) * 100}%` }} /></div>
        <span>سؤال {current + 1} من {quizQuestions.length}</span>
      </div>
      <div className="quiz-card">
        <h3>{q.q}</h3>
        <div className="quiz-options">
          {q.options.map((opt, i) => (
            <button
              key={i}
              className={`quiz-option ${selected !== null ? (i === q.answer ? 'correct' : i === selected ? 'wrong' : 'dim') : ''}`}
              disabled={selected !== null}
              onClick={() => answer(i)}
            >
              {selected !== null && i === q.answer && <CheckCircle2 size={18} />}
              {selected !== null && i === selected && i !== q.answer && <X size={18} />}
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChallengeChampionsPage({ onBack, onRewards, onClaimed }: { onBack: () => void; onRewards: () => void; onClaimed?: () => void }) {
  const predictions = [
    { label: 'بطل الدوري الإنجليزي', options: ['مانشستر سيتي', 'ليفربول', 'أرسنال'], icon: Trophy },
    { label: 'بطل دوري الأبطال', options: ['ريال مدريد', 'بايرن ميونخ', 'مانشستر سيتي'], icon: Crown },
    { label: 'الهداف التاريخي', options: ['هالاند', 'صلاح', 'بيلينغهام'], icon: Star },
    { label: 'أفضل لاعب', options: ['مبابي', 'بيلينغهام', 'هالاند'], icon: Star },
  ];
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [saved, setSaved] = useState(false);

  const pick = (qi: number, oi: number) => setPicks((prev) => ({ ...prev, [qi]: oi }));
  const allAnswered = Object.keys(picks).length === predictions.length;
  const save = () => { if (allAnswered && !saved) { setSaved(true); onClaimed?.(); } };

  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="تحدي الأبطال" onBack={onBack} />
      <div className="challenge-intro">
        <Crown size={40} />
        <div><h2>توقع أبطال الموسم</h2><p>أجب عن توقعاتك لأبطال البطولات والهدافين وأفضل لاعب، وفي نهاية الموسم أصحاب الإجابات الصحيحة يحصلون على بمبات.</p></div>
      </div>
      <div className="champions-predictions">
        {predictions.map((p, qi) => (
          <div className="champion-prediction" key={p.label}>
            <div className="cp-header"><p.icon size={18} /> <b>{p.label}</b></div>
            <div className="cp-options">
              {p.options.map((o, oi) => (
                <button key={o} className={picks[qi] === oi ? 'selected' : ''} onClick={() => pick(qi, oi)}>{o}</button>
              ))}
            </div>
            {picks[qi] === undefined && <small className="cp-miss">لم تختر بعد</small>}
          </div>
        ))}
      </div>
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



