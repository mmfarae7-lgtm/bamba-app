import { useState } from 'react';
import { Download, LogOut, Shield, User, Globe2, Moon, Sun, Bell, Info, Share2, Settings as SettingsIcon, Loader2, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { SubPageHeader, BrandLogo } from './components';
import { supabase } from './lib/supabase';

// ملفات src + الإعدادات الجذرية + ملفات SQL — تُقرأ وقت البناء
const srcFiles = import.meta.glob('./src/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true });
const rootFiles = import.meta.glob('../{index.html,package.json,vite.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,tailwind.config.js,postcss.config.js,eslint.config.js}', { query: '?raw', import: 'default', eager: true });
const migrationFiles = import.meta.glob('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });

// ملفات public (الشعار الرسمي والأيقونات والـ manifest و Service Worker) — تُجلب وقت التنزيل
const publicAssets = [
  '/assets/branding/bmba-logo.png',
  '/assets/branding/bmba-icon-192.png',
  '/assets/branding/bmba-icon-512.png',
  '/assets/branding/bmba-icon-maskable-512.png',
  '/assets/branding/bmba-icon-180.png',
  '/assets/branding/favicon-32.png',
  '/assets/branding/bmba-og.png',
  '/manifest.json',
  '/sw.js',
];

export function SettingsPage({
  onBack,
  darkMode,
  setDarkMode,
  onLogout,
  username,
  email,
  role,
  onAdmin,
}: {
  onBack: () => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  onLogout: () => void;
  username: string;
  email: string;
  role: string;
  onAdmin: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const handleDownloadZip = async () => {
    setDownloading(true);
    setDownloadDone(false);
    setDownloadError('');
    try {
      const zip = new JSZip();

      for (const [fullPath, content] of Object.entries(srcFiles)) {
        zip.file(fullPath.slice(2), content as string);
      }
      for (const [fullPath, content] of Object.entries(rootFiles)) {
        zip.file(fullPath.slice(3), content as string);
      }
      for (const [fullPath, content] of Object.entries(migrationFiles)) {
        zip.file(fullPath.slice(3), content as string);
      }
      for (const assetPath of publicAssets) {
        try {
          const response = await fetch(assetPath);
          if (response.ok) {
            zip.file(assetPath.slice(1), await response.blob());
          }
        } catch {
          // تجاهل الأصول غير المتوفرة — بقية الملفات تُنزّل بشكل طبيعي
        }
      }

      zip.file('.env.example', 'VITE_SUPABASE_URL=your_url_here\nVITE_SUPABASE_ANON_KEY=your_key_here\n');
      zip.file('README.md', '# توقعات بمبا — BMBA\n\nتطبيق توقعات كرة القدم — Vite + React + TypeScript + Supabase.\n\n## التشغيل\n\n1. ثبّت الحزم: `npm install`\n2. ضع مفاتيح Supabase في `.env` (انسخ `.env.example`)\n3. شغّل: `npm run dev`\n\n## قاعدة البيانات\n\nنفّذ ملفات `supabase/migrations/` بالترتيب الزمني في محرر SQL داخل Supabase:\n\n1. `20260916194011_create_profiles_and_admin.sql`\n2. `20260917161741_..._create_admin_dashboard_and_super_admin.sql.sql`\n3. `20260918000000_super_admin_password_fix.sql` — حساب المدير العام super_admin / admin@123\n4. `20260918000100_production_foundation.sql` — السجلات المالية والنقاط والـ Feature Flags\n\n## الشعار\n\nالشعار الرسمي الوحيد: `public/assets/branding/bmba-logo.png` — كل الاستخدامات تمر عبر `src/config/branding.ts` ومكوّن `<BrandLogo />`.\n\n## التثبيت كتطبيق (PWA)\n\nافتح الموقع من المتصفح على أي جهاز (أندرويد/آيفون) واختر "إضافة إلى الشاشة الرئيسية" — يعمل كتطبيق مستقل مع أيقونة الشعار الرسمي.\n');

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bamba-app.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 3000);
    } catch {
      setDownloadError('تعذر تحميل الملف. حاول مرة أخرى.');
    } finally {
      setDownloading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  return (
    <div className="page settings-page">
      <SubPageHeader title="الإعدادات" onBack={onBack} />

      <div className="settings-user-card">
        <span className="profile-avatar-lg">{username.charAt(0)}</span>
        <div>
          <h2>{username}</h2>
          <div className="settings-user-badges">
            <span><User size={13} /> {email}</span>
            {role === 'super_admin' && <span className="admin-badge"><Shield size={13} /> مدير عام</span>}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>تنزيل المشروع</h3>
        <p>حمّل جميع ملفات المشروع كملف مضغوط (ZIP) مع الشعار الرسمي وملفات قاعدة البيانات.</p>
        <button className="settings-download-btn" onClick={handleDownloadZip} disabled={downloading} data-testid="download-zip-button">
          {downloading ? <><Loader2 size={18} className="spin" /> جاري التحضير...</> : <><Download size={18} /> تنزيل المشروع (ZIP)</>}
        </button>
        {downloadDone && <div className="settings-success" data-testid="download-zip-success"><CheckCircle2 size={16} /> تم تنزيل الملف بنجاح!</div>}
        {downloadError && <div className="settings-error">{downloadError}</div>}
        <a className="settings-download-link" href="/downloads/bamba-app.zip" download="bamba-app.zip" data-testid="direct-zip-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '11px 14px', borderRadius: 12, background: '#eff8ef', color: '#197b40', fontWeight: 800, fontSize: 12, textDecoration: 'none' }}>
          <Download size={16} /> تنزيل مباشر (رابط يفتح في المتصفح — مناسب للجوال)
        </a>
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
    </div>
  );
}
