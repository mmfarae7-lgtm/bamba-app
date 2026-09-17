import { useState } from 'react';
import { Download, LogOut, Shield, User, Globe2, Moon, Sun, Bell, Info, Share2, Settings as SettingsIcon, Loader2, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { SubPageHeader } from './components';
import { supabase } from './lib/supabase';

const srcFiles = import.meta.glob('./src/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true });
const rootFiles = import.meta.glob('./{index.html,package.json,vite.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,tailwind.config.js,postcss.config.js,eslint.config.js}', { query: '?raw', import: 'default', eager: true });

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
        zip.file(fullPath.slice(2), content as string);
      }

      zip.file('.env.example', 'VITE_SUPABASE_URL=your_url_here\nVITE_SUPABASE_ANON_KEY=your_key_here\n');
      zip.file('README.md', '# توقعات بمبا - Football Predictions App\n\nBuilt with Vite + React + TypeScript + Supabase.\n\n## Setup\n\n1. Install dependencies: `npm install`\n2. Add your Supabase credentials to `.env`\n3. Run dev server: `npm run dev`\n');

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
        <p>حمّل جميع ملفات المشروع كملف مضغوط (ZIP) لتعمل عليه خارج المنصة.</p>
        <button className="settings-download-btn" onClick={handleDownloadZip} disabled={downloading}>
          {downloading ? <><Loader2 size={18} className="spin" /> جاري التحضير...</> : <><Download size={18} /> تنزيل المشروع (ZIP)</>}
        </button>
        {downloadDone && <div className="settings-success"><CheckCircle2 size={16} /> تم تنزيل الملف بنجاح!</div>}
        {downloadError && <div className="settings-error">{downloadError}</div>}
      </div>

      <div className="settings-section">
        <h3>المظهر</h3>
        <div className="settings-toggle-row" onClick={() => setDarkMode(!darkMode)}>
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
          <button className="settings-admin-btn" onClick={onAdmin}>
            <Shield size={18} /> لوحة إدارة BMBA
          </button>
        </div>
      )}

      <div className="settings-section">
        <button className="settings-logout" onClick={handleLogout}>
          <LogOut size={18} /> تسجيل الخروج
        </button>
      </div>

      <p className="settings-version">توقعات بمبا — الإصدار 1.0.0</p>
    </div>
  );
}
