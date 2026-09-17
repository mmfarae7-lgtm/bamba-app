import { Crown, Mail, Phone, Star, TrendingUp, Trophy, WalletCards } from 'lucide-react';
import { SubPageHeader } from './components';

export function ProfilePage({ onBack }: { onBack: () => void }) {
  const weeklyRank = 7;
  const monthlyRank = 12;
  const seasonRank = 3;
  const correctPredictions = 34;
  const wrongPredictions = 18;

  return (
    <div className="page profile-page">
      <SubPageHeader title="الملف الشخصي" onBack={onBack} />
      <div className="profile-header">
        <span className="profile-avatar-lg">أ</span>
        <h2>أحمد بمبا</h2>
        <div className="profile-badges">
          <span><Mail size={14} /> ahmed@bamba.app</span>
          <span><Phone size={14} /> +966 5X XXX XXXX</span>
        </div>
      </div>
      <div className="profile-stats-grid">
        <div className="profile-stat-card">
          <div className="stat-icon points"><Star size={22} /></div>
          <b>427</b><span>نقطة</span>
        </div>
        <div className="profile-stat-card">
          <div className="stat-icon bamba"><WalletCards size={22} /></div>
          <b>1,320</b><span>بمبة</span>
        </div>
        <div className="profile-stat-card">
          <div className="stat-icon rank"><Trophy size={22} /></div>
          <b>#{seasonRank}</b><span>ترتيب الموسم</span>
        </div>
      </div>
      <div className="profile-ranks">
        <h3>ترتيبي</h3>
        <div className="rank-periods">
          <div className="rank-period"><span>الأسبوعي</span><b>#{weeklyRank}</b></div>
          <div className="rank-period"><span>الشهري</span><b>#{monthlyRank}</b></div>
          <div className="rank-period highlight"><span>الموسمي</span><b>#{seasonRank}</b></div>
        </div>
      </div>
      <div className="prediction-history">
        <h3>تفاصيل التوقعات</h3>
        <div className="prediction-stats">
          <div className="pred-stat correct">
            <TrendingUp size={20} />
            <b>{correctPredictions}</b>
            <span>توقع صحيح</span>
          </div>
          <div className="pred-stat wrong">
            <TrendingUp size={20} className="rotate-180" />
            <b>{wrongPredictions}</b>
            <span>توقع خاطئ</span>
          </div>
          <div className="pred-stat total">
            <Crown size={20} />
            <b>{correctPredictions + wrongPredictions}</b>
            <span>إجمالي التوقعات</span>
          </div>
        </div>
        <div className="accuracy-bar">
          <div className="accuracy-fill" style={{ width: `${(correctPredictions / (correctPredictions + wrongPredictions)) * 100}%` }} />
          <span>نسبة الدقة: {Math.round((correctPredictions / (correctPredictions + wrongPredictions)) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
