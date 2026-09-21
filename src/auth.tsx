import { useState } from 'react';
import { ArrowLeft, ArrowRight, Facebook, Loader2, Lock, Mail, Sparkles, User } from 'lucide-react';
import { BrandLogo } from './components';
import { supabase, supabaseConfigured } from './lib/supabase';
import { COUNTRIES } from './countries';

// يحوّل المُعرّف إلى بريد تسجيل الدخول: يقبل البريد كما هو، أو اسم المستخدم
// الخاص بالمدير العام "super_admin" ويحوله إلى بريد حسابه.
const toAuthEmail = (identifier: string): string => {
  const value = identifier.trim();
  if (value.includes('@')) return value;
  if (value.toLowerCase() === 'super_admin') return 'super_admin@bamba.app';
  return value;
};

// الخطوة الأولى: اختيار اللغة الافتراضية (تظهر عند أول دخول فقط)
// كرة القدم تجمع كل اللغات — نعرض الخيارين بجانب رسالة ترحيبية حسب الاختيار.
export function LanguageStep({ onChoose }: { onChoose: (lang: 'ar' | 'en') => void }) {
  const [selected, setSelected] = useState<'ar' | 'en' | null>(null);

  return (
    <div className="auth-card">
      <p className="eyebrow">الخطوة الأولى<span style={{ fontFamily: "'DM Sans'", marginRight: 6 }}>· First step</span></p>
      <h2>كرة القدم تجمع كل اللغات</h2>
      <p className="auth-subtitle">
        <span>Football unites all languages</span><br />
        قم باختيار لغتك المفضلة للمتابعة<br />
        Choose your default language
      </p>
      <div className="language-options">
        <button className={selected === 'ar' ? 'selected' : ''} onClick={() => setSelected('ar')} data-testid="language-ar-button">
          <b>العربية</b>
          <span className="language-radio">{selected === 'ar' ? '✓' : ''}</span>
        </button>
        <button className={selected === 'en' ? 'selected' : ''} onClick={() => setSelected('en')} data-testid="language-en-button">
          <b>English</b>
          <span className="language-radio">{selected === 'en' ? '✓' : ''}</span>
        </button>
      </div>
      {selected && (
        <div className="welcome-note welcome-big" data-testid="language-welcome-message">
          <Sparkles size={17} />
          <p>
            {selected === 'ar'
              ? 'أهلاً بك في بمبا! كرة القدم تجمعنا — اخترت العربية، لنبدأ التحدي معاً. 🎉'
              : 'Welcome to Bamba! Football unites us — you picked English, let the challenge begin. 🎉'}
          </p>
        </div>
      )}
      <button className="primary-button" disabled={!selected} onClick={() => selected && onChoose(selected)} data-testid="language-continue-button">
        {selected === 'en' ? 'Continue' : 'متابعة'} <ArrowLeft size={18} />
      </button>
      <p className="step-count">01 <span>/ 03</span></p>
    </div>
  );
}

export function LoginStep({ onGuest, onSignup, onLoginSuccess }: { onGuest: () => void; onSignup: () => void; onLoginSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneInfo, setPhoneInfo] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    if (!supabaseConfigured) {
      setLoading(false);
      setError('خدمة الحسابات غير مهيأة في هذه المعاينة — أضف مفاتيح Supabase في ملف .env');
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: toAuthEmail(email), password });
    setLoading(false);
    if (signInError) {
      // مفاتيح الخدمة غير مفعلة بعد (مفتاح غير صالح) — لا علاقة للبيانات المدخلة
      if (signInError.status === 401 && /api key/i.test(signInError.message)) {
        setError('خدمة الحسابات غير مفعلة بعد في هذا المشروع — تُضبط مفاتيح Supabase في ملف .env');
      } else {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      }
      return;
    }
    onLoginSuccess();
  };

  // الدخول عبر جوجل أو فيسبوك — يتطلب تفعيل الموفر في إعدادات Supabase Auth
  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setLoading(true);
    setError('');
    if (!supabaseConfigured) {
      setLoading(false);
      setError('خدمة الحسابات غير مهيأة في هذه المعاينة');
      return;
    }
    const providerName = provider === 'google' ? 'جوجل' : 'فيسبوك';
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider });
    setLoading(false);
    if (oauthError) {
      setError(
        /not enabled|provider/i.test(oauthError.message)
          ? `الدخول عبر ${providerName} غير مفعّل بعد — فعّله في إعدادات المصادقة أولاً`
          : `تعذر فتح نافذة ${providerName}. حاول مجدداً.`,
      );
    }
  };

  return (
    <div className="auth-card login-card">
      <div className="mobile-mark" data-testid="login-brand-logo" style={{ display: 'flex', justifyContent: 'center' }}>
        <BrandLogo size="lg" />
      </div>
      <p className="eyebrow">أهلاً بعودتك</p>
      <h2>سجّل دخولك وابدأ التحدي</h2>
      <p className="auth-subtitle">ادخل ببياناتك للمتابعة إلى حسابك</p>
      <div className="login-form">
        <label className="login-field">
          <Mail size={17} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني أو super_admin" dir="ltr" data-testid="login-email-input" />
        </label>
        <label className="login-field">
          <Lock size={17} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" dir="ltr" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} data-testid="login-password-input" />
        </label>
        {error && <p className="login-error" data-testid="login-error-message">{error}</p>}
        <button className="primary-button" onClick={handleLogin} disabled={loading || !email.trim() || !password.trim()} data-testid="login-submit-button">
          {loading ? <><Loader2 size={18} className="spin" /> جاري الدخول...</> : <>تسجيل الدخول <ArrowLeft size={18} /></>}
        </button>
      </div>
      <div className="or-divider"><span>أو</span></div>
      <div className="social-buttons">
        <button className="google" onClick={() => { void handleOAuth('google'); }} disabled={loading}><span className="social-letter">G</span> التسجيل عبر جوجل</button>
        <button className="facebook" onClick={() => { void handleOAuth('facebook'); }} disabled={loading}><Facebook size={18} fill="currentColor" /> التسجيل عبر فيسبوك</button>
        <button className="phone" onClick={() => setPhoneInfo((v) => !v)}><span>⌕</span> التسجيل برقم الهاتف</button>
      </div>
      {phoneInfo && <p className="login-error">التسجيل برقم الهاتف يُفعّل عند ربط خدمة إرسال رسائل التحقق (SMS/واتساب) — حالياً استخدم البريد الإلكتروني أو جوجل/فيسبوك.</p>}
      <div className="or-divider"><span>أو</span></div>
      <button className="guest-button" onClick={onGuest} data-testid="guest-login-button"><User size={18} /> الدخول كضيف <ArrowLeft size={16} /></button>
      <p className="form-hint">الدخول كضيف يسمح لك بتصفح المباريات والبطولات فقط</p>
      <button className="text-button" onClick={onSignup}>ليس لديك حساب؟ <b>أنشئ حساباً الآن</b></button>
      <p className="step-count">02 <span>/ 03</span></p>
    </div>
  );
}

export function SignupStep({ onComplete, onBack }: { onComplete: (inviteCode?: string) => void; onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('+966');
  const [country, setCountry] = useState('السعودية');
  const [gender, setGender] = useState('ذكر');
  const [dob, setDob] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = username.trim() && email.trim() && password.trim() && phone.trim() && dob;

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    if (!supabaseConfigured) {
      setLoading(false);
      setError('خدمة الحسابات غير مهيأة في هذه المعاينة — أضف مفاتيح Supabase في ملف .env');
      return;
    }
    const phoneFull = (phoneCode + phone).trim();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: username.trim(),
          country,
          phone: phoneFull,
          gender,
          dob,
        },
      },
    });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message === 'User already registered' ? 'هذا البريد مسجل مسبقاً — سجّل دخولك مباشرة' : 'تعذر إنشاء الحساب. حاول مرة أخرى.');
      return;
    }
    if (data.user) {
      // رفع الصورة الشخصية إن اختيرت
      let avatarPath: string | null = null;
      if (avatarFile) {
        const ext = (avatarFile.name.split('.').pop() ?? 'png').toLowerCase();
        avatarPath = `avatars/${data.user.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(avatarPath, avatarFile, { contentType: avatarFile.type || 'image/png', upsert: true });
        if (upErr) avatarPath = null;
      }
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        username: username.trim(),
        email: email.trim(),
        role: 'user',
        bamba_balance: 100,
        user_points: 0,
        country,
        phone: phoneFull,
        gender,
        dob,
        avatar_url: avatarPath,
      });
      if (profileError) console.error('profile insert:', profileError.message);
    }
    setLoading(false);
    // التأكيد التلقائي مفعّل — الجلسة تُنشأ فورًا ويُحمَّل الملف الشخصي في الصفحة الرئيسية
    onComplete(inviteCode.trim() || undefined);
  };

  return (
    <div className="auth-card signup-card">
      <button className="back-button" onClick={onBack} data-testid="signup-back-button"><ArrowRight size={17} /></button>
      <p className="eyebrow">خطوة أخيرة</p>
      <h2>أنشئ حسابك في بمبا</h2>
      <p className="auth-subtitle">قم بإدخال معلوماتك بشكل صحيح حتى نتمكن من التواصل معك في حالة الفوز بإحدى الجوائز لتسليمها</p>
      <label className="upload-avatar" htmlFor="signup-avatar">
        {avatarFile ? <img src={URL.createObjectURL(avatarFile)} alt="الصورة الشخصية" /> : <User size={28} />}
        <span>إضافة صورة شخصية <small>(اختياري)</small></span>
        <b>{avatarFile ? 'تغيير' : 'اختيار'}</b>
      </label>
      <input id="signup-avatar" type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
      <div className="form-grid">
        <label>اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="مثال: محمد بمبا" /></label>
        <label>البريد الإلكتروني<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" dir="ltr" /></label>
        <label>كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" /></label>
        <label className="full-label">رقم الهاتف مع مفتاح الدولة
          <div className="phone-row">
            <select value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} dir="ltr">
              {COUNTRIES.map((c) => <option key={c.name} value={c.code}>{c.flag} {c.code}</option>)}
            </select>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5X XXX XXXX" dir="ltr" inputMode="tel" />
          </div>
        </label>
        <label>الدولة<select value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c.name}>{c.flag} {c.name}</option>)}</select></label>
        <label>الجنس<select value={gender} onChange={(e) => setGender(e.target.value)}><option>ذكر</option><option>أنثى</option></select></label>
        <label className="full-label">تاريخ الميلاد<input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
        <label className="full-label">كود الدعوة <small className="optional">(اختياري)</small>
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="BMBA-XXXXXX" dir="ltr" />
        </label>
      </div>
      <p className="invite-hint">إذا كان لديك كود دعوة من صديق، أدخله هنا — سيحصل صديقك على 50 بمبة تلقائياً.</p>
      {error && <p className="login-error">{error}</p>}
      <button className="primary-button" disabled={!canSubmit || loading} onClick={handleSignup} data-testid="signup-submit-button">
        {loading ? <><Loader2 size={18} className="spin" /> جاري الإنشاء...</> : <>إنشاء الحساب <ArrowLeft size={18} /></>}
      </button>
      <p className="step-count">03 <span>/ 03</span></p>
    </div>
  );
}
