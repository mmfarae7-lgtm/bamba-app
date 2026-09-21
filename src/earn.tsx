import { useState } from 'react';
import { CheckCircle2, ChevronLeft, CircleHelp, Copy, PlayCircle, Share2, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { SubPageHeader, BambaCoin } from './components';

export function EarnPage({
  onBack,
  balance,
  onGoQuiz,
  onGoChallenges,
  onShare,
  inviteCode,
}: {
  onBack: () => void;
  balance: number;
  onGoQuiz: () => void;
  onGoChallenges: () => void;
  onShare: () => void;
  inviteCode: string;
}) {
  const [copied, setCopied] = useState(false);
  const [adsInfo, setAdsInfo] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
    } catch {
      // المتصفح قد يمنع النسخ التلقائي — لا نُفشل العملية
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  // الإعلانات: لا توجد شبكة إعلانات مفعلة حالياً، لذلك لا تُمنح بمبات عن الضغط فقط.
  const openAds = () => {
    setAdsInfo(true);
    window.setTimeout(() => setAdsInfo(false), 3000);
  };

  return (
    <div className="page earn-page">
      <SubPageHeader title="اكسب بمبات" onBack={onBack} />

      <div className="earn-balance" data-testid="earn-balance">
        <BambaCoin size={56} />
        <div>
          <small>رصيد بمباتك</small>
          <b>{balance.toLocaleString()}</b>
        </div>
      </div>
      <p className="earn-welcome"><Sparkles size={14} /> كل مشترك جديد يبدأ بـ 100 بمبة ترحيبية — اكسب المزيد من الأسئلة والمشاركة والدعوات!</p>

      <div className="earn-options">
        <button onClick={openAds} data-testid="earn-ads-button">
          <span className="earn-icon ads"><PlayCircle size={22} /></span>
          <span className="earn-text"><b>الإعلانات</b><small>شاهد إعلاناً واكسب بمبات</small></span>
          <ChevronLeft size={18} />
        </button>
        {adsInfo && <div className="earn-ads-empty" data-testid="earn-ads-empty"><PlayCircle size={15} /> لا توجد إعلانات متاحة حالياً — تُضاف فور توفرها، ولا تُمنح بمبات بمجرد الضغط.</div>}

        <button onClick={onGoQuiz} data-testid="earn-quiz-button">
          <span className="earn-icon quiz"><CircleHelp size={22} /></span>
          <span className="earn-text"><b>جاوب واكسب</b><small>أسئلة رياضية متنوعة — +5 بمبة لكل إجابة صحيحة</small></span>
          <ChevronLeft size={18} />
        </button>

        <button onClick={onShare} data-testid="earn-share-button">
          <span className="earn-icon share"><Share2 size={22} /></span>
          <span className="earn-text"><b>شارك التطبيق</b><small>شارك فعلياً واكسب +10 بمبات يومياً</small></span>
          <ChevronLeft size={18} />
        </button>

        <button onClick={copyCode} data-testid="earn-referral-button">
          <span className="earn-icon code"><Copy size={22} /></span>
          <span className="earn-text"><b>كود الدعوة</b><small>{copied ? 'نُسخ الكود ✓' : 'شارك كودك — كل صديق يسجل به يمنحك +50 بمبة'}</small></span>
          <ChevronLeft size={18} />
        </button>

        <button onClick={onGoChallenges} data-testid="earn-challenges-button">
          <span className="earn-icon chall"><Trophy size={22} /></span>
          <span className="earn-text"><b>التحديات</b><small>اكسب بمبات من إكمال التحديات والمسابقات</small></span>
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="earn-code-box">
        <span>كود دعوتك</span>
        <b data-testid="earn-invite-code">{inviteCode}</b>
        <button onClick={copyCode} data-testid="copy-invite-code-button">
          {copied ? <><CheckCircle2 size={15} /> تم النسخ</> : <><Copy size={15} /> نسخ</>}
        </button>
        <p className="earn-code-hint"><ShieldCheck size={13} /> أدخل الصديق كودك عند إنشاء الحساب — تحصل على 50 بمبة فوراً.</p>
      </div>

      <p className="earn-note"><Sparkles size={14} /> تُضاف المكافآت إلى رصيدك فوراً ولا تتكرر إلا بشروط كل مكافأة</p>
    </div>
  );
}