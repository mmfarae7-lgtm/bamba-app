import { useState } from 'react';
import {
  Coins,
  FileText,
  Gift,
  Globe2,
  HelpCircle,
  Instagram,
  LogOut,
  Send,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  Twitter,
  X,
  Youtube,
} from 'lucide-react';
import type { ReactNode } from 'react';

function InfoShell({ title, subtitle, icon, children, onClose, testid }: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  onClose: () => void;
  testid?: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal info-modal" onClick={(e) => e.stopPropagation()} data-testid={testid}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="reward-orb">{icon}</div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// نافذة اختيار لغة التطبيق — عربي / إنجليزي
export function LanguageModal({ onClose, language, onChoose }: { onClose: () => void; language: string; onChoose: (l: 'ar' | 'en') => void }) {
  return (
    <InfoShell title="لغة التطبيق" subtitle="اختر لغتك المفضلة / Choose your language" icon={<Globe2 size={28} />} onClose={onClose} testid="language-modal">
      <div className="language-options" style={{ marginTop: 18 }}>
        <button className={language === 'ar' ? 'selected' : ''} onClick={() => onChoose('ar')} data-testid="modal-language-ar">
          <b>العربية</b>
          <span className="language-radio">{language === 'ar' ? '✓' : ''}</span>
        </button>
        <button className={language === 'en' ? 'selected' : ''} onClick={() => onChoose('en')} data-testid="modal-language-en">
          <b>English</b>
          <span className="language-radio">{language === 'en' ? '✓' : ''}</span>
        </button>
      </div>
    </InfoShell>
  );
}

// نافذة معلومات المسابقة — كيفية الاستخدام وآلية احتساب النقاط والبمبات والجوائز
export function CompetitionInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoShell title="معلومات المسابقة" subtitle="كل ما تحتاجه للعب والفوز" icon={<Trophy size={28} />} onClose={onClose} testid="competition-info-modal">
      <div className="info-sections">
        <div className="info-block">
          <h3><Target size={17} /> كيفية الاستخدام</h3>
          <p>افتح صفحة المباريات، اختر مباراة قادمة، ثم أدخل النتيجة التي تتوقعها. يمكنك تعديل توقعك حتى موعد بدء المباراة.</p>
        </div>
        <div className="info-block">
          <h3><Star size={17} /> آلية احتساب النقاط</h3>
          <p>التوقع الصحيح يمنحك نقاط المباراة كاملة، وتزيد قيمة النقاط كلما زادت صعوبة المباراة. النتيجة الدقيقة تمنحك مكافأة إضافية.</p>
        </div>
        <div className="info-block">
          <h3><Coins size={17} /> عملات بمبا</h3>
          <p>تكسب عملات بمبا من التحديات والأسئلة ومشاهدة الإعلانات ودعوة الأصدقاء، وتستخدمها في المتجر للحصول على ميزات ومكافآت داخل التطبيق.</p>
        </div>
        <div className="info-block">
          <h3><Gift size={17} /> الفائزون والجوائز</h3>
          <p>يُتوَّج أصحاب أعلى النقاط أسبوعياً وشهرياً وموسمياً بجوائز حصرية، ويتم التواصل معهم عبر البيانات المسجلة في الحساب لتسليم الجوائز.</p>
        </div>
      </div>
    </InfoShell>
  );
}

const SOCIALS = [
  { name: 'X (تويتر)', handle: '@bamba', icon: <Twitter size={19} />, url: 'https://x.com/' },
  { name: 'إنستغرام', handle: '@bamba', icon: <Instagram size={19} />, url: 'https://instagram.com/' },
  { name: 'يوتيوب', handle: 'Bamba', icon: <Youtube size={19} />, url: 'https://youtube.com/' },
  { name: 'تيليجرام', handle: '@bamba', icon: <Send size={19} />, url: 'https://t.me/' },
];

// نافذة «تابعنا» — صفحاتنا على وسائل التواصل
export function FollowUsModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoShell title="تابعنا" subtitle="تابعنا على وسائل التواصل ليصلك كل جديد" icon={<Send size={28} />} onClose={onClose} testid="followus-modal">
      <div className="follow-list">
        {SOCIALS.map((s) => (
          <a key={s.name} className="follow-row" href={s.url} target="_blank" rel="noreferrer noopener">
            <span className="follow-icon">{s.icon}</span>
            <span className="follow-text"><b>{s.name}</b><small>{s.handle}</small></span>
          </a>
        ))}
      </div>
    </InfoShell>
  );
}

const FAQS = [
  { q: 'كيف أربح الجوائز؟', a: 'اجمع أعلى عدد نقاط من التوقعات الصحيحة لتصعد في الترتيب الأسبوعي والشهري والموسمي.' },
  { q: 'كيف أكسب عملات بمبا؟', a: 'من الأسئلة، ومشاهدة الإعلانات، ومشاركة التطبيق، ودعوة الأصدقاء، والتحديات داخل التطبيق.' },
  { q: 'هل يمكنني التوقع كضيف؟', a: 'وضع الضيف يتيح التصفح فقط. أنشئ حساباً أو سجّل دخولك لتتمكن من التوقع وجمع النقاط.' },
  { q: 'متى تُحدَّث النقاط؟', a: 'تُحدَّث نتائج المباريات والنقاط تلقائياً بعد انتهاء كل مباراة.' },
];

// نافذة «بيانات الاستخدام» — سياسة الخصوصية وشروط الخدمة والأسئلة الشائعة وتسجيل الخروج
export function UsageDataModal({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <InfoShell title="بيانات الاستخدام" subtitle="سياسة الخصوصية · شروط الخدمة · الأسئلة الشائعة" icon={<FileText size={28} />} onClose={onClose} testid="usage-data-modal">
      <div className="info-sections">
        <div className="info-block">
          <h3><ShieldCheck size={17} /> سياسة الخصوصية</h3>
          <p>نحفظ بياناتك (الاسم، البريد، الهاتف، الدولة) لغرض تشغيل الحساب والتواصل معك عند الفوز فقط، ولا نشاركها مع أي طرف آخر.</p>
        </div>
        <div className="info-block">
          <h3><FileText size={17} /> شروط الخدمة</h3>
          <p>يجب إدخال معلومات صحيحة، ويُمنع إنشاء حسابات متعددة أو التلاعب بالنتائج. يحق لإدارة التطبيق إيقاف أي حساب مخالف.</p>
        </div>
        <div className="info-block">
          <h3><HelpCircle size={17} /> الأسئلة الشائعة</h3>
          <div className="faq-list">
            {FAQS.map((f, i) => (
              <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={f.q}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}>{f.q}</button>
                {openFaq === i && <p>{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <button className="settings-logout" onClick={onLogout} data-testid="usage-logout-button"><LogOut size={18} /> تسجيل الخروج</button>
    </InfoShell>
  );
}
