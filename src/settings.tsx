import { useState } from 'react';
import { LogOut, Shield, User, Globe2, Moon, Sun, Bell, Info, Share2, Settings as SettingsIcon, Phone, ShieldCheck, Loader2, X } from 'lucide-react';
import { SubPageHeader } from './components';
import { supabase, avatarUrl } from './lib/supabase';

export function SettingsPage({
  onBack,
  darkMode,
  setDarkMode,
  onLogout,
  username,
  email,
  role,
  avatarUrl: avatarPath,
  country,
  phone,
  onAdmin,
  onOpenProfile,
}: {
  onBack: () => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  onLogout: () => void;
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  country: string;
  phone: string;
  onAdmin: () => void;
  onOpenProfile: () => void;
}) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  // توثيق رقم الجوال برسالة SMS حقيقية (يعمل فور ربط Twilio في Supabase Auth)
  const [phoneVerify, setPhoneVerify] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  const sendOtp = async () => {
    setVerifyBusy(true);
    setVerifyMsg('');
    const target = phone && phone !== '—' ? phone : '';
    if (!target) {
      setVerifyMsg('أضف رقم هاتفك أولاً من «تعديل بياناتي».');
      setVerifyBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ phone: target });
    setVerifyBusy(false);
    if (error) {
      setVerifyMsg(
        'لم تُرسل رسالة بعد: خدمة SMS غير مفعّلة في هذا المشروع. لإرسال رسائل تحقق حقيقية رُبط Supabase مع Twilio (مفتاح SID + Auth Token + رقم مرسل) ثم أعد المحاولة.',
      );
      return;
    }
    setOtpSent(true);
    setVerifyMsg('أُرسل رمز التحقق إلى رقمك عبر SMS — أدخله أدناه.');
  };

  const verifyCode = async () => {
    const target = phone && phone !== '—' ? phone : '';
    if (!target || otpCode.trim().length < 4) return;
    setVerifyBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: target, token: otpCode.trim(), type: 'sms' });
    setVerifyBusy(false);
    if (error) {
      setVerifyMsg('الرمز غير صحيح أو انتهت صلاحيته — اطلب رمزاً جديداً.');
      return;
    }
    setOtpSent(false);
    setOtpCode('');
    setVerifyMsg('');
    setPhoneVerify(false);
    setVerifyMsg('تم توثيق رقم جوالك بنجاح ✓');
  };

  return (
    <div className="page settings-page">
      <SubPageHeader title="الإعدادات" onBack={onBack} />

      <div className="settings-user-card">
        {avatarPath ? (
          <img className="profile-avatar-img settings-avatar" src={avatarUrl(avatarPath) ?? ''} alt={username} />
        ) : (
          <span className="profile-avatar-lg">{username.charAt(0)}</span>
        )}
        <div>
          <h2>{username}</h2>
          <div className="settings-user-badges">
            <span><User size={13} /> {email}</span>
            {role === 'super_admin' && <span className="admin-badge"><Shield size={13} /> مدير عام</span>}
            {country && <span><Globe2 size={13} /> {country}</span>}
            {phone && phone !== '—' && <span dir="ltr"><Phone size={13} /> {phone}</span>}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <button className="settings-edit-profile-btn" onClick={onOpenProfile} data-testid="open-profile-edit-button">
          <User size={18} /> تعديل بياناتي <small>(الصورة، الاسم، الهاتف، الدولة...)</small>
        </button>
      </div>

      <div className="settings-section">
        <h3>الحساب والأمان</h3>
        <div className="settings-menu-list">
          <button onClick={() => setPhoneVerify(true)}><ShieldCheck size={18} /> توثيق رقم الجوال (SMS) <span className="menu-value">{phone && phone !== '—' ? phone : 'أضف رقمك أولاً'}</span></button>
        </div>
      </div>

      <div className="settings-section">
        <h3>المظهر</h3>
        <div className="settings-toggle-row" onClick={() => setDarkMode(!darkMode)} data-testid="dark-mode-toggle">
          <div className="settings-toggle-info">
            {darkMode ? <Moon size={20} /> : <Sun size={20} />}
            <div>
              <b>الوضع {darkMode ? 'الليلي' : 'النهاري'}</b>
              <small>تبديل بين الوضع الفاتح والداكن</small>
            </div>
          </div>
          <span className={`toggle-switch ${darkMode ? 'on' : ''}`}><i /></span>
        </div>
      </div>

      <div className="settings-section">
        <h3>التطبيق</h3>
        <div className="settings-menu-list">
          <button><Globe2 size={18} /> لغة التطبيق <span className="menu-value">العربية</span></button>
          <button><Bell size={18} /> الإشعارات <span className="toggle-switch on"><i /></span></button>
          <button><Info size={18} /> معلومات المسابقة</button>
          <button><Share2 size={18} /> مشاركة التطبيق</button>
          <button><SettingsIcon size={18} /> إعدادات متقدمة</button>
        </div>
      </div>

      {role === 'super_admin' && (
        <div className="settings-section">
          <button className="settings-admin-btn" onClick={onAdmin} data-testid="open-admin-button">
            <Shield size={18} /> لوحة إدارة BMBA
          </button>
        </div>
      )}

      <div className="settings-section">
        <button className="settings-logout" onClick={handleLogout} data-testid="settings-logout-button">
          <LogOut size={18} /> تسجيل الخروج
        </button>
      </div>

      <p className="settings-version">توقعات بمبا — الإصدار 1.0.0</p>

      {phoneVerify && (
        <div className="modal-backdrop" onClick={() => setPhoneVerify(false)}>
          <div className="modal phone-verify-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPhoneVerify(false)}><X size={18} /></button>
            <span className="modal-kicker"><ShieldCheck size={14} /> التحقق بالرسائل</span>
            <h2>توثيق رقم الجوال</h2>
            <p className="auth-subtitle">نرسل رمزاً من 6 أرقام إلى رقم جوالك للتأكد أنه رقمك الحقيقي.</p>
            <div className="phone-verify-target" dir="ltr"><Phone size={15} /> {phone && phone !== '—' ? phone : '—'}</div>
            {otpSent ? (
              <>
                <input
                  className="otp-input"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="الرمز"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  autoFocus
                />
                <button className="primary-button" disabled={otpCode.trim().length < 4 || verifyBusy} onClick={() => void verifyCode()}>
                  {verifyBusy ? <><Loader2 size={18} className="spin" /> جاري التحقق...</> : <>تأكيد الرمز</>}
                </button>
              </>
            ) : (
              <button className="primary-button" disabled={verifyBusy} onClick={() => void sendOtp()}>
                {verifyBusy ? <><Loader2 size={18} className="spin" /> جاري الإرسال...</> : <>إرسال رمز التحقق (SMS)</>}
              </button>
            )}
            {verifyMsg && <p className="settings-error">{verifyMsg}</p>}
            <p className="phone-verify-note">رسالة تحقق حقيقية تُرسل عبر Supabase + Twilio. الواتساب مدعوم إذا كان رقم Twilio مفعّلاً لديه.</p>
          </div>
        </div>
      )}
    </div>
  );
}
