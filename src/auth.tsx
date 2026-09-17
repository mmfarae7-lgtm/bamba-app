import { useState } from 'react';
import { ArrowLeft, ArrowRight, Facebook, Loader2, Lock, Mail, MoreHorizontal, User } from 'lucide-react';
import { BambaMark } from './components';
import { supabase } from './lib/supabase';

export function LoginStep({ onGuest, onSignup, onLoginSuccess }: { onGuest: () => void; onSignup: () => void; onLoginSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      return;
    }
    onLoginSuccess();
  };

  return (
    <div className="auth-card login-card">
      <div className="mobile-mark"><BambaMark /></div>
      <p className="eyebrow">أهلاً بعودتك</p>
      <h2>سجّل دخولك وابدأ التحدي</h2>
      <p className="auth-subtitle">ادخل ببياناتك للمتابعة إلى حسابك</p>
      <div className="login-form">
        <label className="login-field">
          <Mail size={17} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" dir="ltr" />
        </label>
        <label className="login-field">
          <Lock size={17} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" dir="ltr" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="primary-button" onClick={handleLogin} disabled={loading || !email.trim() || !password.trim()}>
          {loading ? <><Loader2 size={18} className="spin" /> جاري الدخول...</> : <>تسجيل الدخول <ArrowLeft size={18} /></>}
        </button>
      </div>
      <div className="or-divider"><span>أو</span></div>
      <div className="social-buttons">
        <button className="google"><span className="social-letter">G</span> التسجيل عبر جوجل</button>
        <button className="facebook"><Facebook size={18} fill="currentColor" /> التسجيل عبر فيسبوك</button>
        <button className="phone"><span>⌕</span> التسجيل برقم الهاتف</button>
      </div>
      <div className="or-divider"><span>أو</span></div>
      <button className="guest-button" onClick={onGuest}><User size={18} /> الدخول كضيف <ArrowLeft size={16} /></button>
      <p className="form-hint">الدخول كضيف يسمح لك بتصفح المباريات والبطولات فقط</p>
      <button className="text-button" onClick={onSignup}>ليس لديك حساب؟ <b>أنشئ حساباً الآن</b></button>
      <p className="step-count">02 <span>/ 03</span></p>
    </div>
  );
}

export function SignupStep({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('السعودية');
  const [gender, setGender] = useState('ذكر');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = username.trim() && email.trim() && password.trim() && phone.trim() && dob;

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim(), country, phone: phone.trim() } },
    });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message === 'User already registered' ? 'هذا البريد مسجل مسبقاً' : 'تعذر إنشاء الحساب. حاول مرة أخرى.');
      return;
    }
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: username.trim(),
        email: email.trim(),
        role: 'user',
        bamba_balance: 1320,
        user_points: 0,
        country,
      });
    }
    setLoading(false);
    onComplete();
  };

  return (
    <div className="auth-card signup-card">
      <button className="back-button" onClick={onBack}><ArrowRight size={17} /></button>
      <p className="eyebrow">خطوة أخيرة</p>
      <h2>أنشئ حسابك في بمبا</h2>
      <p className="auth-subtitle">أدخل معلوماتك حتى نتواصل معك عند الفوز</p>
      <div className="upload-avatar">
        <User size={28} />
        <span>إضافة صورة شخصية <small>(اختياري)</small></span>
        <button><MoreHorizontal size={16} /></button>
      </div>
      <div className="form-grid">
        <label>اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="مثال: محمد بمبا" /></label>
        <label>البريد الإلكتروني<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" dir="ltr" /></label>
        <label>كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" /></label>
        <label>رقم الهاتف<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 5X XXX XXXX" /></label>
        <label>الدولة<select value={country} onChange={(e) => setCountry(e.target.value)}><option>السعودية</option><option>مصر</option><option>الإمارات</option><option>قطر</option></select></label>
        <label>الجنس<select value={gender} onChange={(e) => setGender(e.target.value)}><option>ذكر</option><option>أنثى</option></select></label>
        <label className="full-label">تاريخ الميلاد<input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
      </div>
      {error && <p className="login-error">{error}</p>}
      <button className="primary-button" disabled={!canSubmit || loading} onClick={handleSignup}>
        {loading ? <><Loader2 size={18} className="spin" /> جاري الإنشاء...</> : <>إنشاء الحساب <ArrowLeft size={18} /></>}
      </button>
      <p className="step-count">03 <span>/ 03</span></p>
    </div>
  );
}
