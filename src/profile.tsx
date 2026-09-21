import { useEffect, useState } from 'react';
import { Camera, Check, Crown, Globe2, Loader2, Mail, Pencil, Phone, Star, TrendingUp, Trophy, WalletCards } from 'lucide-react';
import { SubPageHeader } from './components';
import { supabase, avatarUrl } from './lib/supabase';
import { COUNTRIES } from './countries';
import { fetchPredictions, statsFromPredictions } from './lib/scoring';
import type { Profile } from './lib/supabase';

type LeaderRow = { username: string; user_points: number; country: string; avatar_url: string | null };

export function ProfilePage({
  onBack, profile, guest, phone, onProfileChange, predictionsCount,
}: {
  onBack: () => void;
  profile: Profile | null;
  guest: boolean;
  phone: string;
  onProfileChange: (p: Profile) => void;
  predictionsCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [seasonRank, setSeasonRank] = useState<number | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [username, setUsername] = useState(profile?.username ?? '');
  const [countrySel, setCountrySel] = useState(profile?.country ?? 'السعودية');
  const [phoneVal, setPhoneVal] = useState(phone);
  const [phoneCode, setPhoneCode] = useState('+966');
  const [genderSel, setGenderSel] = useState(profile?.gender ?? 'ذكر');
  const [dobVal, setDobVal] = useState(profile?.dob ?? '');

  const name = guest ? 'ضيف' : (profile?.username ?? 'لاعب بمبا');
  const email = guest ? 'تصفّح بدون حساب' : (profile?.email ?? '—');
  const avatarPath = guest ? null : (profile?.avatar_url ?? null);
  const country = guest ? '—' : (profile?.country ?? '—');
  const points = guest ? 0 : (profile?.user_points ?? 0);
  const bamba = guest ? 0 : (profile?.bamba_balance ?? 0);
  const phoneDisplay = guest ? 'سجّل للانضمام' : (phone || '—');

  // فتح وضع التعديل — مزامنة الحقول من بيانات الحساب الفعلية
  const openEdit = () => {
    if (!profile) return;
    const ph = profile.phone || phone;
    const matched = COUNTRIES.find((c) => ph?.startsWith(c.code));
    setPhoneCode(matched?.code ?? '+966');
    setPhoneVal(matched && ph ? ph.slice(matched.code.length).trim() : ph);
    setUsername(profile.username ?? '');
    setCountrySel(profile.country || 'السعودية');
    setGenderSel(profile.gender || 'ذكر');
    setDobVal(profile.dob ?? '');
    setAvatarFile(null);
    setMsg('');
    setEditing(true);
  };

  // الترتيب الموسمي الحقيقي من عرض leaderboard
  useEffect(() => {
    if (guest || !profile) return;
    let mounted = true;
    void (async () => {
      const { data } = await supabase.from('leaderboard').select('username, user_points, country, avatar_url').order('user_points', { ascending: false });
      if (!mounted || !data) return;
      const rows = data as LeaderRow[];
      const idx = rows.findIndex((r) => r.username === profile.username);
      setSeasonRank(idx >= 0 ? idx + 1 : null);
    })();
    return () => { mounted = false; };
  }, [guest, profile]);

  // إحصاءات حقيقية من قاعدة البيانات (بعد اعتماد النتائج تُحتسب النقاط آلياً)
  const [predStats, setPredStats] = useState({ correct: 0, wrong: 0, pending: 0 });
  useEffect(() => {
    if (guest || !profile) return;
    let mounted = true;
    void (async () => {
      const preds = await fetchPredictions(profile.id);
      if (!mounted) return;
      const s = statsFromPredictions(preds);
      setPredStats({ correct: s.correct, wrong: s.wrong, pending: s.pending });
    })();
    return () => { mounted = false; };
  }, [guest, profile]);

  if (!profile || guest) {
    return (
      <div className="page profile-page">
        <SubPageHeader title="الملف الشخصي" onBack={onBack} />
        <div className="profile-header">
          <span className="profile-avatar-lg">{name.charAt(0)}</span>
          <h2>{name}</h2>
          <div className="profile-badges">
            <span><Mail size={14} /> {email}</span>
            <span><Phone size={14} /> {phoneDisplay}</span>
            <span><Globe2 size={14} /> {country}</span>
          </div>
        </div>
        <div className="profile-stats-grid">
          <div className="profile-stat-card"><div className="stat-icon points"><Star size={22} /></div><b>0</b><span>نقطة</span></div>
          <div className="profile-stat-card"><div className="stat-icon bamba"><WalletCards size={22} /></div><b>0</b><span>بمبة</span></div>
          <div className="profile-stat-card"><div className="stat-icon rank"><Trophy size={22} /></div><b>—</b><span>ترتيب الموسم</span></div>
        </div>
        <div className="guest-note-card">
          <Crown size={26} />
          <p><b>سجّل حسابك</b> لمتابعة نقاطك ورصيدك والتنافس في الترتيب، وتعديل صورتك الشخصية وبياناتك.</p>
        </div>
      </div>
    );
  }

  const saveEdits = async () => {
    if (!username.trim()) { setMsg('اسم المستخدم مطلوب'); return; }
    setBusy(true);
    let avatarPathResult = profile.avatar_url ?? null;
    if (avatarFile) {
      const ext = (avatarFile.name.split('.').pop() ?? 'png').toLowerCase();
      avatarPathResult = `avatars/${profile.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(avatarPathResult, avatarFile, { contentType: avatarFile.type || 'image/png', upsert: true });
      if (upErr) { setMsg(`فشل رفع الصورة: ${upErr.message}`); setBusy(false); return; }
    }
    const raw = phoneVal.replace(/[\s-]/g, '');
    const phoneFull = raw.startsWith(phoneCode) ? raw : phoneCode + raw.replace(/^\+/, '');
    const patch: Partial<Profile> = {
      username: username.trim(),
      country: countrySel,
      phone: phoneFull,
      gender: genderSel,
      dob: dobVal,
      avatar_url: avatarPathResult,
    };
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select('*').maybeSingle();
    setBusy(false);
    if (error) { setMsg(`تعذر الحفظ: ${error.message}`); return; }
    if (data) {
      onProfileChange(data as Profile);
      setEditing(false);
      setAvatarFile(null);
      setMsg('');
    }
  };

  return (
    <div className="page profile-page">
      <SubPageHeader title="الملف الشخصي" onBack={onBack} />
      <div className="profile-header">
        {avatarPath ? (
          <div className="profile-avatar-wrap">
            <img className="profile-avatar-img" src={avatarUrl(avatarPath) ?? ''} alt={name} />
            <button className="profile-camera-btn" onClick={openEdit} aria-label="تغيير الصورة"><Camera size={15} /></button>
          </div>
        ) : (
          <span className="profile-avatar-lg">{name.charAt(0)}</span>
        )}
        <h2>{name}</h2>
        <div className="profile-badges">
          <span><Mail size={14} /> {email}</span>
          <span><Phone size={14} /> {phoneDisplay}</span>
          <span><Globe2 size={14} /> {country}</span>
        </div>
        <button className="profile-edit-toggle" onClick={() => (editing ? setEditing(false) : openEdit())}>
          <Pencil size={15} /> {editing ? 'إغلاق التعديل' : 'تعديل بياناتي'}
        </button>
      </div>

      {editing && (
        <div className="profile-edit-card" data-testid="profile-edit-card">
          <h3>تعديل الملف الشخصي</h3>
          <label className="profile-edit-avatar" htmlFor="profile-avatar-input">
            <img src={avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl(avatarPath) ?? ''} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span><Camera size={15} /> تغيير الصورة الشخصية</span>
          </label>
          <input id="profile-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} data-testid="profile-avatar-input" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
          <div className="form-grid">
            <label>اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="profile-username" /></label>
            <label>الدولة<select value={countrySel} onChange={(e) => setCountrySel(e.target.value)} data-testid="profile-country">{COUNTRIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
            <label className="full-label">رقم الهاتف مع مفتاح الدولة
              <div className="phone-row">
                <select value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} dir="ltr">{COUNTRIES.map((c) => <option key={c.name} value={c.code}>{c.flag} {c.code}</option>)}</select>
                <input value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} dir="ltr" data-testid="profile-phone" />
              </div>
            </label>
            <label>الجنس<select value={genderSel} onChange={(e) => setGenderSel(e.target.value)}><option>ذكر</option><option>أنثى</option></select></label>
            <label>تاريخ الميلاد<input type="date" value={dobVal} onChange={(e) => setDobVal(e.target.value)} /></label>
          </div>
          {msg && <p className="profile-edit-msg">{msg}</p>}
          <button className="primary-button" disabled={busy} onClick={() => void saveEdits()} data-testid="profile-save">
            {busy ? <><Loader2 size={17} className="spin" /> جارٍ الحفظ...</> : <><Check size={17} /> حفظ التعديلات</>}
          </button>
        </div>
      )}

      <div className="profile-stats-grid">
        <div className="profile-stat-card"><div className="stat-icon points"><Star size={22} /></div><b>{points.toLocaleString()}</b><span>نقطة</span></div>
        <div className="profile-stat-card"><div className="stat-icon bamba"><WalletCards size={22} /></div><b>{bamba.toLocaleString()}</b><span>بمبة</span></div>
        <div className="profile-stat-card"><div className="stat-icon rank"><Trophy size={22} /></div><b>{seasonRank ? `#${seasonRank}` : '—'}</b><span>ترتيب الموسم</span></div>
      </div>

      <div className="profile-ranks">
        <h3>ترتيبي</h3>
        <div className="rank-periods">
          <div className="rank-period"><span>الترتيب الموسمي</span><b>{seasonRank ? `#${seasonRank}` : '—'}</b></div>
          <div className="rank-period highlight"><span>نقاط الموسم</span><b>{points.toLocaleString()}</b></div>
        </div>
      </div>

      <div className="prediction-history">
        <h3>تفاصيل التوقعات</h3>
        <div className="prediction-stats">
          <div className="pred-stat total"><Crown size={20} /><b>{predictionsCount}</b><span>إجمالي التوقعات</span></div>
          <div className="pred-stat correct"><TrendingUp size={20} /><b>{predStats.correct}</b><span>توقع صحيح</span></div>
          <div className="pred-stat wrong"><TrendingUp size={20} className="rotate-180" /><b>{predStats.wrong}</b><span>توقع خاطئ</span></div>
        </div>
        <p className="prediction-note">
          {predStats.pending > 0
            ? `${predStats.pending} توقعات بانتظار اعتماد نتيجة المباريات — تُحتسب النقاط تلقائياً عند اعتمادها.`
            : 'تُحتسب النقاط تلقائياً بعد اعتماد نتيجة كل مباراة وفق آلية احتساب النقاط.'}
        </p>
      </div>
    </div>
  );
}