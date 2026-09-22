# Origin Security Checklist — BMBA

قبل تشغيل أي origin خلف Cloudflare، تأكد مما يلي (بالترتيب):

## 1) إخفاء الأصل
- [ ] لا يوجد سجل DNS عام مباشر للـ origin (لا A/AAAA عام للخوادم الحقيقية).
- [ ] كل النطاقات Proxied (برتقالي) — DNS-only ممنوع لـ BMBA.
- [ ] لا يظهر أي IP أصل في العناوين أو سجلات التاريخ أو شهادات SSL المكشوفة (استخدم شهادات Cloudflare edge).

## 2) تقييد الوصول إلى الأصل
- [ ] **Authenticated Origin Pulls (mTLS)** مفعّل بين CF والـ origin حيثما أمكن (Vercel يدعمها؛ Supabase تتصل عبر قيود الشبكة بدلًا منها).
- [ ] قواعد جدار حماية الأصل تقبل فقط نطاقات Cloudflare IPs:
  - نشر قائمة `https://www.cloudflare.com/ips-v4` و `/ips-v6` في Firewall الأصلي.
  - رفض كل اتصال آخر (حتى لو كان HTTPS مباشرًا).
- [ ] لا كشف للمنافذ غير الضرورية (22/3306 إلخ) على الإنترنت.

## 3) ترويسات موثوقة
- [ ] لا تثق بـ `X-Forwarded-For` الواردة؛ استخدم `CF-Connecting-IP` بعد التحقق من مصدرها (Verify Origin Pull).
- [ ] سجّل هوية الحافة في الـ origin (`CF-Ray`) للتدقيق.

## 4) TLS
- [ ] وضع الاتصال: **Full (Strict)**.
- [ ] `Always Use HTTPS` + HSTS (اختياري: `max-age=31536000; includeSubDomains` مع preload لاحقًا).

## 5) أسرار
- [ ] لا رموز خدمة في الكود أو العميل (لا `SUPABASE_SERVICE_ROLE` في الواجهة أبدًا).
- [ ] مفاتيح R2/Workers في `env` فقط، ورفوفها عبر Workers/SDK على الخادم.
- [ ] مباشرة بعد أي تسريب (مثل توكن طُبع في محادثة): **أدر/أبطل التوكن فورًا** (`sbp_...`).

## 6) تطبيق فعلي على أصول BMBA
- [ ] **Vercel (الويب)**: إضافة CF Access اختياريًا على `admin.*`, وتفعيل WAF/Rate limits من `cloudflare/*.json`.
- [ ] **Supabase (الـ API)**: حاليًا يتحقق من JWT + RLS — هذه طبقة موثوقة. عند وضع `api.bmba.com` أمامها عبر Worker/Gateway، طبّق WAF + Rate limit + Schema Validation، وأبقِ RLS أساس الحماية.
- [ ] اعتماد سياسة النشر (Staging → Production) من `docs/cloudflare-architecture.md` §11.

## 7) مراقبة
- [ ] تفعيل Security Analytics + WAF logs وربط التنبيهات (حجب مفاجئ، معدلات 4xx/5xx).
- [ ] مراجعة دورية لقواعد Rate Limits مع الذروات الجديدة (تحديات، حملات).