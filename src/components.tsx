import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CircleHelp,
  Copy,
  Globe2,
  Info,
  LogIn,
  Moon,
  PlayCircle,
  Search,
  Settings,
  Share2,
  Sun,
  User,
  WalletCards,
  X,
  Zap,
  Home,
  Trophy,
  Crown,
  Flame,
} from 'lucide-react';
import type { Tab, Match } from './types';
import { BRAND } from './config/branding';

export function BrandLogo({ size = 'md', linkToHome = false, onClick }: { size?: 'sm' | 'md' | 'lg'; linkToHome?: boolean; onClick?: () => void }) {
  const dimensions = { sm: 28, md: 40, lg: 56 }[size];
  const img = (
    <img
      src={BRAND.logo}
      alt={BRAND.logoAlt}
      style={{ width: dimensions, height: dimensions, objectFit: 'contain' }}
    />
  );
  if (linkToHome) {
    return <button onClick={onClick} style={{ background: 'transparent', padding: 0, border: 0 }}>{img}</button>;
  }
  return img;
}

export function BambaMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand-mark compact' : 'brand-mark'}>
      <div className="ball-mark"><CircleDot size={22} strokeWidth={2.4} /></div>
      {!compact && <span>BMBA</span>}
    </div>
  );
}

export function TopBar({
  onProfile,
  onRewards,
  onHome,
  darkMode,
  setDarkMode,
  showProfile,
  bambaBalance,
  userPoints,
  onSettings,
}: {
  onProfile: () => void;
  onRewards: () => void;
  onHome: () => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  showProfile: boolean;
  bambaBalance: number;
  userPoints: number;
  onSettings: () => void;
}) {
  return (
    <header className="topbar">
      <button className="balance-chip" onClick={onRewards}>
        <WalletCards size={20} />
        <span><small>رصيد البمبات</small><b>{bambaBalance.toLocaleString()}</b></span>
      </button>
      <button className="app-brand" onClick={onHome}>
        <BambaMark compact />
        <span>توقعات بمبا</span>
      </button>
      <div className="profile-actions">
        <button className="icon-button notification-button"><Bell size={19} /><i /></button>
        <button className="profile-chip" onClick={onProfile}>
          <span><small>نقاطي</small><b>{userPoints}</b></span>
          <span className="avatar">أ</span>
          <ChevronDown size={16} />
        </button>
        {showProfile && <ProfileMenu darkMode={darkMode} setDarkMode={setDarkMode} onSettings={onSettings} />}
      </div>
    </header>
  );
}

function ProfileMenu({ darkMode, setDarkMode, onSettings }: { darkMode: boolean; setDarkMode: (v: boolean) => void; onSettings: () => void }) {
  return (
    <div className="profile-menu">
      <div className="menu-user">
        <span className="avatar large">أ</span>
        <div><b>أحمد بمبا</b><small>عضو منذ 2025</small></div>
      </div>
      <button><User size={17} /> الملف الشخصي</button>
      <button onClick={onSettings}><Settings size={17} /> الإعدادات</button>
      <button><Globe2 size={17} /> لغة التطبيق <span className="menu-value">العربية</span></button>
      <button onClick={() => setDarkMode(!darkMode)}>
        {darkMode ? <Sun size={17} /> : <Moon size={17} />} الوضع {darkMode ? 'النهاري' : 'الليلي'}
      </button>
      <button><Info size={17} /> معلومات المسابقة</button>
      <button><Share2 size={17} /> مشاركة التطبيق</button>
      <button><Info size={17} /> بيانات الاستخدام</button>
      <button className="logout"><LogIn size={17} /> تسجيل الخروج</button>
    </div>
  );
}

export function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      <NavButton icon={Home} label="المباريات" active={tab === 'matches'} onClick={() => setTab('matches')} />
      <NavButton icon={Trophy} label="البطولات" active={tab === 'leagues'} onClick={() => setTab('leagues')} />
      <NavButton icon={Crown} label="الترتيب" active={tab === 'ranking'} onClick={() => setTab('ranking')} />
      <NavButton icon={Flame} label="التحديات" active={tab === 'challenges'} onClick={() => setTab('challenges')} />
    </nav>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: typeof Home; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <Icon size={22} /><span>{label}</span>
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
      <button onClick={onBack}><ArrowRight size={20} /></button>
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
          <div>
            <span className="team-logo home-logo">{match.homeShort}</span>
            <b>{match.home}</b>
            <input value={home} onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} inputMode="numeric" placeholder="0" />
          </div>
          <span className="dash">-</span>
          <div>
            <input value={away} onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} inputMode="numeric" placeholder="0" />
            <b>{match.away}</b>
            <span className="team-logo away-logo">{match.awayShort}</span>
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
        <button className="copy-code"><Copy size={16} /> انسخ كود الدعوة <b>BMBA427</b></button>
      </div>
    </div>
  );
}

export function CalendarModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal calendar-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="calendar-heading">
          <button><ChevronRight size={18} /></button>
          <h2>يناير 2025</h2>
          <button><ChevronLeft size={18} /></button>
        </div>
        <div className="calendar-grid">
          {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((day) => <b key={day}>{day}</b>)}
          {Array.from({ length: 31 }, (_, i) => <button className={i + 1 === 17 ? 'today' : ''} key={i}>{i + 1}</button>)}
        </div>
        <button className="primary-button" onClick={onClose}>عرض مباريات هذا اليوم</button>
      </div>
    </div>
  );
}
