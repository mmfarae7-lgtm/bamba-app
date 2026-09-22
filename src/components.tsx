import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CircleHelp,
  Copy,
  FileText,
  Globe2,
  HelpCircle,
  Info,
  LogIn,
  Moon,
  PlayCircle,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Sun,
  Trophy,
  User,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import type { Tab, Match } from './types';
import { BRAND, BRAND_LOGO_SIZES } from './config/branding';
import type { BrandSize, BrandVariant } from './config/branding';
import { avatarUrl } from './lib/supabase';

// المكوّن الموحّد للشعار — يعرض صورة الشعار الرسمية من المصدر المركزي في كل مكان.
// كل النسخ (default/compact/white/dark) تستخدم نفس الملف الرسمي: الصورة شفافة
// وتعمل على الخلفية الفاتحة والداكنة بلا حاجة لألوان بديلة.
export function BrandLogo({
  size = 'md',
  variant = 'default',
  linkToHome = false,
  onClick,
  className,
}: {
  size?: BrandSize;
  variant?: BrandVariant;
  linkToHome?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const dimensions = BRAND_LOGO_SIZES[size];
  const img = (
    <img
      src={BRAND.logo}
      alt={BRAND.logoAlt}
      width={dimensions}
      height={dimensions}
      draggable={false}
      data-testid="brand-logo"
      data-variant={variant}
      className={className}
      style={{
        width: dimensions,
        height: dimensions,
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
        background: 'transparent',
        border: 0,
      }}
    />
  );
  if (linkToHome) {
    return (
      <button
        onClick={onClick}
        data-testid="brand-logo-home-button"
        aria-label="الصفحة الرئيسية"
        style={{ background: 'transparent', padding: 0, border: 0, cursor: 'pointer' }}
      >
        {img}
      </button>
    );
  }
  return img;
}

// عملة بمبا الرسمية — صورة PNG موحّدة من مصدر العلامة.
export function BambaCoin({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <img
      src={BRAND.coin}
      alt={BRAND.coinAlt}
      width={size}
      height={size}
      draggable={false}
      className={`bamba-coin ${className ?? ''}`}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}

export function TopBar({
  onProfile,
  onRewards,
  onHome,
  username,
  userPoints,
  bambaBalance,
}: {
  onProfile: () => void;
  onRewards: () => void;
  onHome: () => void;
  username: string;
  userPoints: number;
  bambaBalance: number;
}) {
  return (
    <header className="topbar">
      {/* يمين الشريط: الملف الشخصي (الصورة + النقاط) — قائمة الملف الشخصي تُعرض
          كـ Bottom Sheet من أسفل الشاشة (جوال) أو Dropdown (شاشات أعرض) */}
      <div className="profile-actions">
        <button className="profile-chip" onClick={onProfile} data-testid="profile-chip-button">
          <span><small>نقاطي</small><b>{userPoints}</b></span>
          <span className="avatar">{(username || '?').trim().charAt(0)}</span>
          <ChevronDown size={16} />
        </button>
      </div>
      {/* وسط الشريط: أيقونة التطبيق واسمه */}
      <button className="app-brand" onClick={onHome} data-testid="topbar-brand-button">
        <BrandLogo size="md" />
        {/* نص الاسم بجانب الشعار للوصولية و SEO — الشعار نفسه صورة رسمية وليس نصاً */}
        <span>توقعات بمبا</span>
      </button>
      {/* يسار الشريط: عملة بمبا وعدد البمبات */}
      <button className="balance-chip" onClick={onRewards} data-testid="balance-chip-button">
        <BambaCoin size={28} />
        <span><small>بمباتي</small><b>{bambaBalance.toLocaleString()}</b></span>
      </button>
    </header>
  );
}

// قائمة الملف الشخصي — Bottom Sheet على الجوال / Dropdown على الشاشات الأعرض.
// تُعرض هذه القائمة خارج الـ TopBar (على مستوى app-shell في App) كي تغطي
// خلفيتها المعتمة كامل الشاشة فوق الشريط السفلي وكل عناصر الصفحة (z-index).
export function ProfileMenu({
  darkMode,
  setDarkMode,
  onSettings,
  onProfilePage,
  onLogout,
  onClose,
  username,
  avatar,
  userPoints,
  bambaBalance,
  language,
  onLanguage,
  onCompetitionInfo,
  onFollowUs,
  onShare,
  onUsageData,
}: {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  onSettings: () => void;
  onProfilePage: () => void;
  onLogout: () => void;
  onClose: () => void;
  username: string;
  avatar: string | null;
  userPoints: number;
  bambaBalance: number;
  language: string;
  onLanguage: () => void;
  onCompetitionInfo: () => void;
  onFollowUs: () => void;
  onShare: () => void;
  onUsageData: () => void;
}) {
  // سحب للأسفل على مقبض القائمة يغلقها (جوال)
  const [dragStartY, setDragStartY] = useState<number | null>(null);

  return (
    <div className="profile-menu-layer" data-testid="profile-menu">
      {/* خلفية معتمة تغطي الشاشة — الضغط خارج القائمة يغلقها */}
      <div className="profile-menu-backdrop" onClick={onClose} data-testid="profile-menu-backdrop" />
      <aside className="profile-menu" role="dialog" aria-modal="true" aria-label="قائمة الملف الشخصي">
        <div
          className="menu-grabber"
          onTouchStart={(e) => setDragStartY(e.touches[0]!.clientY)}
          onTouchEnd={(e) => {
            if (dragStartY === null) return;
            const dy = e.changedTouches[0]!.clientY - dragStartY;
            setDragStartY(null);
            if (dy > 70) onClose();
          }}
        >
          <span />
        </div>
        <button className="menu-close" onClick={onClose} aria-label="إغلاق القائمة" data-testid="profile-menu-close">
          <X size={18} />
        </button>
        <header className="menu-header">
          <span className="avatar large menu-avatar">
            {avatar ? (
              <img src={avatarUrl(avatar) ?? ''} alt={username || 'لاعب بمبا'} />
            ) : (
              (username || '?').trim().charAt(0)
            )}
          </span>
          <div className="menu-head-main">
            <b>{username || 'لاعب بمبا'}</b>
            <div className="menu-head-stats">
              <span className="menu-stat"><Zap size={13} /><b>{userPoints.toLocaleString()}</b> نقاط</span>
              <span className="menu-stat"><BambaCoin size={14} /><b>{bambaBalance.toLocaleString()}</b> بمبات</span>
            </div>
          </div>
        </header>

        <div className="menu-sections">
          <section className="menu-section">
            <h5 className="menu-section-label">الحساب</h5>
            <button onClick={onProfilePage} data-testid="open-profile-button"><span className="menu-item-icon"><User size={17} /></span>الملف الشخصي<span className="menu-value">عرض الصفحة</span></button>
            <button onClick={onSettings} data-testid="open-settings-button"><span className="menu-item-icon"><Settings size={17} /></span>الإعدادات</button>
          </section>
          <section className="menu-section">
            <h5 className="menu-section-label">التفضيلات</h5>
            <button onClick={onLanguage} data-testid="open-language-button"><span className="menu-item-icon"><Globe2 size={17} /></span>لغة التطبيق<span className="menu-value">{language === 'en' ? 'English' : 'العربية'}</span></button>
            <button onClick={() => setDarkMode(!darkMode)} data-testid="menu-darkmode-button"><span className="menu-item-icon">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</span>وضع التطبيق<span className="menu-value">{darkMode ? 'نهاري' : 'ليلي'}</span></button>
          </section>
          <section className="menu-section">
            <h5 className="menu-section-label">التطبيق والمجتمع</h5>
            <button onClick={onCompetitionInfo} data-testid="open-competition-info-button"><span className="menu-item-icon"><Trophy size={17} /></span>معلومات البطولات</button>
            <button onClick={onFollowUs} data-testid="open-followus-button"><span className="menu-item-icon"><Share2 size={17} /></span>تابعنا</button>
            <button onClick={onShare} data-testid="share-app-button"><span className="menu-item-icon"><Send size={17} /></span>مشاركة التطبيق</button>
          </section>
          <section className="menu-section">
            <h5 className="menu-section-label">السياسة والدعم</h5>
            <button onClick={onUsageData} data-testid="open-usage-button"><span className="menu-item-icon"><ShieldCheck size={17} /></span>سياسة الخصوصية</button>
            <button onClick={onUsageData} data-testid="open-terms-button"><span className="menu-item-icon"><FileText size={17} /></span>شروط الاستخدام</button>
            <button onClick={onUsageData} data-testid="open-faq-button"><span className="menu-item-icon"><HelpCircle size={17} /></span>الأسئلة الشائعة</button>
          </section>
          <button className="logout" onClick={onLogout} data-testid="profile-menu-logout-button"><span className="menu-item-icon"><LogIn size={17} /></span>تسجيل الخروج</button>
        </div>
      </aside>
    </div>
  );
}

export function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <NavButton emoji="⚽" label="المباريات" active={tab === 'matches'} onClick={() => setTab('matches')} />
      <NavButton emoji="🏆" label="البطولات" active={tab === 'leagues'} onClick={() => setTab('leagues')} />
      <NavButton emoji="🥇" label="الترتيب" active={tab === 'ranking'} onClick={() => setTab('ranking')} />
      <NavButton emoji="🔥" label="التحديات" active={tab === 'challenges'} onClick={() => setTab('challenges')} />
    </nav>
  );
}

function NavButton({ emoji, label, active, onClick }: { emoji: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <span className="nav-emoji">{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

export function PageHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      {action}
    </div>
  );
}

export function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="subpage-header">
      <button onClick={onBack} data-testid="subpage-back-button"><ArrowRight size={20} /></button>
      <h1>{title}</h1>
    </div>
  );
}

export function PredictionModal({ match, existing, onClose, onSave }: { match: Match; existing?: string; onClose: () => void; onSave: (id: number, prediction: string) => void }) {
  const [home, setHome] = useState(existing?.split('-')[0] ?? '');
  const [away, setAway] = useState(existing?.split('-')[1] ?? '');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal prediction-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <span className="modal-kicker"><Zap size={14} /> مباراة بـ {match.points} نقاط</span>
        <h2>توقع نتيجة المباراة</h2>
        <p>{match.home} ضد {match.away}</p>
        <div className="score-inputs">
          {/* عمود الفريق الأول (المضيف) — الشعار فوق الاسم فوق حقل النتيجة */}
          <div className="team-column">
            <span className="team-logo home-logo">{match.homeShort}</span>
            <b className="team-name">{match.home}</b>
          </div>
          {/* عمود الفريق الثاني (الضيف) — بنفس بنية العمود الأول تماماً */}
          <div className="team-column">
            <span className="team-logo away-logo">{match.awayShort}</span>
            <b className="team-name">{match.away}</b>
          </div>
          {/* صف حقلي النتيجة يمتد بعرض العمودين — علامة - في المنتصف تماماً */}
          <div className="score-row">
            <input value={home} onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} inputMode="numeric" placeholder="0" aria-label={`نتيجة ${match.home}`} />
            <span className="dash">-</span>
            <input value={away} onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} inputMode="numeric" placeholder="0" aria-label={`نتيجة ${match.away}`} />
          </div>
        </div>
        <button className="primary-button" disabled={home === '' || away === ''} onClick={() => onSave(match.id, `${home}-${away}`)}>
          {existing ? 'حفظ تعديل التوقع' : 'تأكيد التوقع'} <ArrowLeft size={18} />
        </button>
      </div>
    </div>
  );
}

export function RewardsModal({ onClose, balance }: { onClose: () => void; balance: number }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rewards-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="reward-orb"><WalletCards size={29} /></div>
        <span className="eyebrow">رصيدك الحالي</span>
        <h2>{balance.toLocaleString()} <small>بمبة</small></h2>
        <p>اجمع المزيد من البمبات واستبدلها بمكافآت حصرية.</p>
        <div className="reward-options">
          <button><PlayCircle size={20} /><span><b>شاهد واكسب</b><small>+50 بمبة يومياً</small></span><ChevronLeft size={17} /></button>
          <button><CircleHelp size={20} /><span><b>جاوب واكسب</b><small>أسئلة رياضية يومية</small></span><ChevronLeft size={17} /></button>
          <button><Share2 size={20} /><span><b>شارك التطبيق</b><small>+100 بمبة لكل دعوة</small></span><ChevronLeft size={17} /></button>
        </div>
        <button className="copy-code" data-testid="copy-invite-code-button"><Copy size={16} /> انسخ كود الدعوة <b>BMBA427</b></button>
      </div>
    </div>
  );
}

const CALENDAR_MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const parseIsoLocal = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toIsoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// تقويم شهري حقيقي — اختيار أي تاريخ يعيده للسائق، مع تنقّل بين الأشهر بالأسهم.
export function CalendarModal({ onClose, selected = '', onSelect }: { onClose: () => void; selected?: string; onSelect?: (iso: string) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initial = selected ? parseIsoLocal(selected) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leading = (new Date(viewYear, viewMonth, 1).getDay() + 1) % 7; // أسبوع يبدأ السبت
  const todayIso = toIsoLocal(today);

  const shiftMonth = (n: number) => {
    let y = viewYear;
    let m = viewMonth + n;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewYear(y);
    setViewMonth(m);
  };

  const pick = (day: number) => {
    const iso = toIsoLocal(new Date(viewYear, viewMonth, day));
    if (onSelect) onSelect(iso);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="calendar-modal">
      <div className="modal calendar-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="calendar-heading">
          <button onClick={() => shiftMonth(-1)} aria-label="الشهر السابق"><ChevronRight size={18} /></button>
          <h2>{CALENDAR_MONTHS_AR[viewMonth]} {viewYear}</h2>
          <button onClick={() => shiftMonth(1)} aria-label="الشهر التالي"><ChevronLeft size={18} /></button>
        </div>
        <div className="calendar-grid">
          {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((day) => <b key={day}>{day}</b>)}
          {Array.from({ length: leading }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const iso = toIsoLocal(new Date(viewYear, viewMonth, day));
            const cls = [
              iso === todayIso ? 'today' : '',
              iso === selected ? 'selected' : '',
              new Date(viewYear, viewMonth, day) < today ? 'past' : '',
            ].filter(Boolean).join(' ');
            return <button key={day} className={cls} onClick={() => pick(day)}>{day}</button>;
          })}
        </div>
        <button className="primary-button" onClick={onClose}>عرض مباريات هذا اليوم</button>
      </div>
    </div>
  );
}
