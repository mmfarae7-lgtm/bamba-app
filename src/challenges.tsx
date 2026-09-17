import { useState } from 'react';
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
  Trophy,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { challenges, quizQuestions, storeItems } from './data';
import { PageHeading, SubPageHeader } from './components';
import type { Challenge } from './types';

const iconMap: Record<string, typeof Users> = {
  Users, CircleHelp, Crown, ShieldCheck, ShoppingBag,
};

export function ChallengesHub({ onChallengeClick, onRewards }: { onChallengeClick: (c: Challenge) => void; onRewards: () => void }) {
  return (
    <div className="page challenges-page">
      <PageHeading eyebrow="استمتع بالمنافسة" title="التحديات" action={<button className="outline-button" onClick={onRewards}><Gift size={16} /> المكافآت</button>} />
      <div className="challenge-banner">
        <div>
          <span>جاهز للمنافسة؟</span>
          <h2>إذا كنت من عشاق التحديات المثيرة، هنا مكانك</h2>
          <p>اختر تحديك المفضل وابدأ اللعب واربح بمبات.</p>
        </div>
        <Flame size={80} />
      </div>
      <div className="challenge-grid">
        {challenges.map((c) => {
          const Icon = iconMap[c.icon] ?? Users;
          return (
            <button className={`challenge-card ${c.color}`} key={c.title} onClick={() => onChallengeClick(c)}>
              <span className="challenge-icon"><Icon size={26} /></span>
              <span><b>{c.title}</b><small>{c.text}</small></span>
              <ArrowLeft size={18} />
            </button>
          );
        })}
      </div>
      <div className="coach-card">
        <div className="coach-icon"><ShieldCheck size={31} /></div>
        <div><span>الأكثر إثارة</span><h3>كوّن فريق أحلامك في «أنت المدرب»</h3><p>اختر 15 لاعباً وتابع أداءهم أسبوعياً.</p></div>
        <button>ابدأ الآن <ArrowLeft size={16} /></button>
      </div>
    </div>
  );
}

export function ChallengeArenaPage({ onBack, onRewards }: { onBack: () => void; onRewards: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="حلبة التوقعات" onBack={onBack} />
      <div className="challenge-intro">
        <Users size={40} />
        <div>
          <h2>أنشئ حلبتك الخاصة</h2>
          <p>أنشئ تحدياً خاصاً مع أصدقائك أو عائلتك، أو انضم لحلبة موجودة.</p>
        </div>
      </div>
      <div className="arena-rules">
        <div className="rule-card"><span>1</span><b>إنشاء حلبة واحدة</b><small>يحق لكل عضو إنشاء حلبة توقعات واحدة</small></div>
        <div className="rule-card"><span>2</span><b>الاشتراك في حلبتين</b><small>يمكنك الاشتراك في حلبتين كحد أقصى</small></div>
        <div className="rule-card"><span>3</span><b>دعوة بالكود</b><small>ادعو أصدقاءك عبر كود رقمي فريد</small></div>
      </div>
      <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={18} /> أنشئ حلبتك الآن</button>
      <div className="arena-list">
        <h3>حلباتي</h3>
        <div className="arena-card">
          <div className="arena-info"><b>حلبة الأصدقاء</b><small>5 أعضاء • الدوري الإنجليزي</small></div>
          <span className="arena-code"><Copy size={14} /> كود: 4827</span>
        </div>
        <div className="arena-card">
          <div className="arena-info"><b>عائلة بمبا</b><small>8 أعضاء • كل البطولات</small></div>
          <span className="arena-code"><Copy size={14} /> كود: 1936</span>
        </div>
      </div>
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreate(false)}><X size={18} /></button>
            <h2>إنشاء حلبة جديدة</h2>
            <div className="form-grid">
              <label className="full-label">اسم الحلبة<input placeholder="مثال: حلبة الأصدقاء" /></label>
              <label className="full-label">البطولة<select><option>الدوري الإنجليزي</option><option>الدوري الإسباني</option><option>دوري أبطال أوروبا</option><option>كل البطولات</option></select></label>
            </div>
            <button className="primary-button" onClick={() => setShowCreate(false)}>إنشاء الحلبة <ArrowLeft size={18} /></button>
          </div>
        </div>
      )}
      <button className="rewards-fab" onClick={onRewards}><Gift size={20} /></button>
    </div>
  );
}

export function ChallengeQuizPage({ onBack, onReward }: { onBack: () => void; onReward: () => void }) {
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
          <button className="primary-button" onClick={onReward}>استلام المكافأة <ArrowLeft size={18} /></button>
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

export function ChallengeChampionsPage({ onBack }: { onBack: () => void }) {
  const predictions = [
    { label: 'بطل الدوري الإنجليزي', options: ['مانشستر سيتي', 'ليفربول', 'أرسنال'], icon: Trophy },
    { label: 'بطل دوري الأبطال', options: ['ريال مدريد', 'بايرن ميونخ', 'مانشستر سيتي'], icon: Crown },
    { label: 'الهداف التاريخي', options: ['هالاند', 'صلاح', 'بيلينغهام'], icon: Star },
    { label: 'أفضل لاعب', options: ['مبابي', 'بيلينغهام', 'هالاند'], icon: Star },
  ];
  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="تحدي الأبطال" onBack={onBack} />
      <div className="challenge-intro">
        <Crown size={40} />
        <div><h2>توقع أبطال الموسم</h2><p>توقع من سيفوز بالبطولات الكبرى وفي نهاية الموسم، الفائزون يحصلون على بمبات.</p></div>
      </div>
      <div className="champions-predictions">
        {predictions.map((p) => (
          <div className="champion-prediction" key={p.label}>
            <div className="cp-header"><p.icon size={18} /> <b>{p.label}</b></div>
            <div className="cp-options">{p.options.map((o, i) => <button key={o} className={i === 0 ? 'selected' : ''}>{o}</button>)}</div>
          </div>
        ))}
      </div>
      <button className="primary-button">حفظ التوقعات <ArrowLeft size={18} /></button>
    </div>
  );
}

export function ChallengeStorePage({ onBack }: { onBack: () => void }) {
  return (
    <div className="page challenge-sub-page">
      <SubPageHeader title="متجر بمبا" onBack={onBack} />
      <div className="store-balance"><WalletCards size={24} /><div><span>رصيدك</span><b>1,320 بمبة</b></div></div>
      <div className="store-grid">
        {storeItems.map((item) => (
          <div className="store-card" key={item.id}>
            <div className="store-badge">{item.discount} خصم</div>
            <div className="store-icon"><ShoppingBag size={28} /></div>
            <b>{item.name}</b>
            <small>{item.category} • {item.store}</small>
            <div className="store-cost"><Zap size={14} /> {item.cost.toLocaleString()} بمبة</div>
            <button className="store-buy">استبدال</button>
          </div>
        ))}
      </div>
    </div>
  );
}



