# Cloudflare في بنية BMBA — بوابة حماية أمام التطبيق (ليست بديلًا عن الـ Backend/RBAC)

> مرجع معماري موحّد — بتاريخ 2026-09-22.
> Cloudflare هو **طبقة حماية وبوابة** أمام BMBA (Web / API / Admin)، وليس بديلًا عن الـ Backend أو نظام الصلاحيات.
> مصدر الحقيقة للصلاحيات يبقى: **Supabase RLS + دوال الـ RBAC** (`has_permission` / `check_scope` / الموافقات / التدقيق)
> الموثّقة في `docs/admin-api-contract.md` والمنفّذة في الهجرات `20260926_permission_rbac.sql` و`20260928_api_contract_core.sql`.

---

## 1) الموقع في البنية

```
                 المستخدم
                    │
                    ▼
             ┌──────────────┐
             │  Cloudflare  │   DNS / CDN / WAF / DDoS / Rate Limit / API Shield / R2
             └──────┬───────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     BMBA Web/App*        BMBA API
                              │
                              ▼
              Authentication (JWT + RLS)           ← Supabase، يتحقق منه الـ Backend دائمًا
                              │
                              ▼
                     RBAC / Permission            ← has_permission (20260926)
                              │
                              ▼
                         Scope Check              ← check_scope / role_scopes
                              │
                              ▼
                      Approval Workflow           ← approval_requests + exec_approval (20260928)
                              │
                              ▼
                       Business Logic             ← RPCs security definer
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                 Database            Ledger
```

- **BMBA Web/App**: الحالي كـ SPA على Vercel (`bomba-app-second.vercel.app`) يخاطب Supabase مباشرة.
- **BMBA API**: حاليًا واجهة Supabase REST/RPC (`vigfdsxavkkrzyommiab.supabase.co`) — نقطة التحصين التالية عبر `api.bmba.com` (قسم 8).
- **قاعدة ذهبية**: أي وصول مباشر/مختصر للـ API **يُرفض من الـ Backend** إذا لم يحمل الصلاحية الصحيحة — Cloudflare لا يعرف المستخدم، بل يحدّ بالـ IP/الترويسات فقط.

---

## 2) مصفوفة المسؤوليات (من يملك كل تحكم)

| الجزء | المسؤول | ملاحظة الربط بالمنفَّذ |
|---|---|---|
| DNS / CDN / DDoS / WAF | Cloudflare | — |
| Rate Limiting خارجي (coarse) | Cloudflare | بالـ IP/الترويسات فقط |
| Rate Limiting لكل مستخدم (fine) | BMBA Backend | يُبنى كدالة `api_check_rate` (شريحة قادمة) |
| Authentication / JWT | BMBA Backend (Supabase) | `auth.users` + RLS |
| RBAC / Permissions | BMBA Backend | `has_permission` — 20260926 |
| Scope | BMBA Backend | `role_scopes` + `check_scope` — 20260926 |
| Approval | BMBA Backend | `approval_requests` + `exec_approval` — 20260928 |
| Idempotency | BMBA Backend | `idempotency_keys` (§35) — 20260928 |
| Bambat / Points / Fantasy Ledger | BMBA Backend + DB | `wallet_transactions` / `points_ledger` |
| Audit Log | BMBA Backend + DB | `admin_audit_logs` بلا delete/update (§27) |
| Business Logic | BMBA Backend | RPCs security definer |
| الملفات والصور | Cloudflare R2 | القسم 9 |

---

## 3) DNS والنطاقات

المخطط (التطبيق في `cloudflare/dns-records.json`):

| النطاق | النوع | الوجهة (Origin) | CF Proxy | الغرض |
|---|---|---|---|---|
| `bmba.com` | A/CNAME | Vercel origin | ✅ (برتقالي) | الموقع الرئيسي |
| `www.bmba.com` | CNAME | `bmba.com` | ✅ | تحويل www |
| `api.bmba.com` | CNAME | `vigfdsxavkkrzyommiab.supabase.co` (حاليًا) أو الـ Backend لاحقًا | ✅ | واجهة الـ API: WAF + Rate Limits + API Shield |
| `admin.bmba.com` | CNAME | نفس origin | ✅ | لوحة الإدارة: حماية مشدّدة (قسم 6) |
| `staging.bmba.com` / `api-staging.bmba.com` | CNAME | بيئة تجريبية منفصلة | ✅ | بيئة Staging |
| `dev.bmba.com` | CNAME | بيئة تجريبية | ✅ | بيئة Dev (اختياري) |

قواعد إلزامية:
- كل النطاقات **Proxied (برتقالي)** — ولا يُكشف الـ origin IP أبدًا.
- `Always Use HTTPS` + `HSTS` + TLS **Full (Strict)**.
- `api.bmba.com` لا تُستخدم لأي صفحة ويب؛ فقط REST/RPC (+ `OPTIONS` لـ CORS).
- لا سجلات A عامة للـ origin مباشرة.

> ملاحظة واقعية: التطبيق الحالي يستخدم `supabase-js` بعنوان `xxx.supabase.co` مباشرةً. لوضع `api.bmba.com` أمام Supabase يلزم Worker/Gateway يعيد توجيه `/rest/v1/*` و`/auth/v1/*` مع CORS — موضّح في قسم 8.

---

## 4) WAF

التطبيق في `cloudflare/waf-rules.json`.

- **Managed Rulesets**: تفعيل OWASP Core Ruleset — حساسية **Medium** على `/api/*` و **High** على `/admin/*`.
- **Custom Rules** أمثلة:
  1. حجب غير قائمة البلدان المسموحة لـ `admin.bmba.com` (Allowlist للفريق).
  2. Bot Fight Mode على `admin.bmba.com` + تحدٍّ للأجهزة الغريبة على `/api/v1/auth/*`.
  3. حجب ASNs سيئة السمعة (قائمة قابلة للتحديث) على كل النطاقات.
  4. Skip rules: `/.well-known/*`, `/healthz`, `OPTIONS`, ملفات ثابتة (`*.js|css|png|svg|woff2`).
  5. (اختياري مع Access) حجب كل طلبات `/api/v1/admin/*` التي لا تحمل جلسة Access موقّعة.

---

## 5) Rate Limiting

نموذج الطبقات (السبب: Cloudflare يحدّ خارجيًا بالـ IP، أما معرفة المستخدم/الصلاحية ففي الـ Backend):

```
Public API
     │
     ▼
Cloudflare Rate Limit      ← coarse: IP / header، عند حافة الشبكة
     │
     ▼
Backend Rate Limit         ← fine: لكل مستخدم (دالة api_check_rate — شريعة قادمة)
     │
     ▼
Authentication → RBAC → Scope → Approval
```

السياسات المقترحة (`cloudflare/rate-limits.json`) مع ربطها بالعقد:

| المسار | حد CF | نافذة | ملاحظة | العقد |
|---|---|---|---|---|
| `POST /api/v1/auth/login` | 5 | 1 د | لكل IP؛ أدقّ على admin | §4 |
| `POST /api/v1/auth/otp` + 2FA verify | 5 | 1 د | حجب 10 د عند التجاوز (Anti-Brute) | §4 |
| `POST /api/v1/predictions` | 120 | 1 د | (نشر/تعديل) + حد لكل مستخدم في الـ Backend | §13 |
| `POST /api/v1/quiz/answers` | 60 | 1 د | انفجاري (Quiz) — امتصاص عند الحافة | §19 |
| `POST /api/v1/wallet/*` | 20 | 1 د | عمليات حساسة + إلزام `Idempotency-Key` (§35) | §15 |
| `POST /api/v1/payments/*` | 20 | 1 د | + Idempotency | §16 |
| `/api/v1/admin/*` | 300 | 1 د | منخفض عمومًا + Access/IP allowlist (قسم 6) | الكل |
| `GET /api/v1/matches` و`leaderboard` | مرتفع | — | عالي مع Caching (قسم 10) لامتصاص الذروة | §12/§26 |

**الذروات** (بداية المباراة، إغلاق التوقعات، النتائج، تحديث الترتيب، إطلاق تحدي/Quiz، حملات كبيرة) يمتصها:
1. Caching عند الحافة (قسم 10).
2. Rate Limits عند الحافة (لا تصل للـ Origin أصلًا).
3. الـ Backend بالـ limit لكل مستخدم + الاستعلامات المُحسَّنة والفهارس (ليست Queue بعد).

---

## 6) حماية Admin Dashboard — دفاع متعدد الطبقات

```
admin.bmba.com
       │
       ▼
Cloudflare Access (Zero Trust)  ← اختياري (تسجيل دخول + جلسة CF)
Cloudflare Rate Limit منخفض + Bot Fight Mode + WAF High
       │
       ▼
Admin Backend
       │
       ▼
Admin Authentication → 2FA (مخطط §4 — يُنفَّذ لاحقًا)
       │
       ▼
RBAC → Permission → Scope → Approval   ← 20260926 + 20260928 (غير قابل للتجاوز)
```

- Cloudflare **ليس بديلًا** عن أي طبقة Backend: لو وصل شخص للـ API مباشرة يُرفضه `has_permission`/`check_scope`/حالة الطلب.
- الخطط الخارجية (CF Access / allowlist IP / Bot Fight) تقلّص السطح، والصلاحيات الحقيقية في القاعدة.

---

## 7) حماية الـ Origin Server

القائمة الكاملة في `cloudflare/origin-security-checklist.md`. الأهم:
- الـ origin **غير مكشوف**: لا DNS مباشر عام، كل شيء Proxied، والوصول محصور عبر نطاقات Cloudflare IPs (Authenticated Origin Pulls / mTLS عند الإمكان).
- تجاهل `X-Forwarded-For` من غير Cloudflare؛ استخدم رأس `CF-Connecting-IP` بعد التحقق (Verify Origin Pull).
- تعطيل الوصول المباشر لبيئات Vercel/Supabase من الإنترنت غير الممر عبر CF حيثما أمكن (Supabase: قيود الشبكة/IP + JWT verification).
- المفاتيح في الـ env فقط، لا رموز في الكود/العميل (.env مثال، `VITE_...` تُفضَّل غير حساسة).

---

## 8) API Shield + OpenAPI

- `docs/admin-api-contract.md` هو مرجع العقد — يُستخرج منه ملف **OpenAPI** (شريحة قادمة) ويُفعَّل عليه Schema Validation عبر Cloudflare API Shield (`/api/v1` و`/api/v1/admin`).
- **حاليًا** الـ API هو واجهة Supabase REST/RPC: لتفعيل الحماية الكاملة نحتاج Gateway أمام Supabase (Worker يعيد توجيه `/rest/v1/*`,`/auth/v1/*` بـ CORS) ثم:
  - WAF + Rate Limit + Schema Validation على `api.bmba.com`.
  - jwts التحقق يبقى في Supabase (RLS) — CF لا يفتح صلاحيات.
- mTLS (Authenticated Origin Pulls) للـ Origin، وMutual TLS اختياري للـ Admin API.

---

## 9) R2 للملفات (Object Storage)

التخطيط في `cloudflare/r2-buckets.json`:

```
R2
├── player-images/
├── team-logos/
├── competition-images/
├── challenge-images/
├── prize-images/
├── partner-images/
├── user-uploads/
└── support-attachments/
```

- القراءة العامة عبر CDN (CF) مع **Signed URL** للرفع (Presigned / Workers) — لا نكشف مفاتيح R2 للعميل.
- **لا تُخزَّن** كلمات المرور، أرصدة Bambat، أو النقاط في R2 — هذه بيانات قاعدة بيانات فقط.
- الواجهات: S3-compatible + Workers API — تُربط بالأصل عند بناء شريحة الرفع (avatar حاليًا في `profiles.avatar_url`).

---

## 10) استراتيجية الـ Cache

`cloudflare/caching.json`:
- **Static**: JS/CSS/صور — TTL طويل (1y) + ETag؛ `index.html` بـ no-cache عند النشر.
- **API GET عام**: مباريات/ترتيب/توقعات — TTL قصير (10–60s) + `stale-while-revalidate` لامتصاص الذروات (قسم 5).
- **Cache Key**: locale + competition.
- **لا Cache**: `/auth/*`, `/wallet/*`, `/payments/*`, أي شيء بهوية مستخدم.

---

## 11) بيئات Development / Staging / Production

| البيئة | النطاق | الوجهة | ملاحظات |
|---|---|---|---|
| Dev | محلي `localhost` (`.env`) | Supabase تجريبي | Feature flags مغلقة |
| Staging | `staging.bmba.com` + `api-staging.bmba.com` | نسخ Profiling | بيانات تجريبية، اختبار WAF/Rate Limits قبل الصعود |
| Production | `bmba.com` / `api.*` / `admin.*` | المشروع الحالي `vigfdsxavkkrzyommiab` | سياسات مشدّدة، نشرها عبر pipeline |

- سياسة الصعود: Dev (كود) → Staging (integration مع CF) → Production (نفس خطوات Staging معتدلة).

---

## 12) الربط مع الـ API/RBAC المنفَّذ (ما نسلمه لكل طبقة)

| التحكم | طبقة الحماية الخارجية (CF) | الإنفاذ النهائي (Backend — منفَّذ) |
|---|---|---|
| الدخول/2FA | Rate limit على `/auth/*` | JWT + RLS (§4) |
| RBAC | لا شيء (لا يعرف المستخدم) | `has_permission` (20260926) |
| Scope | لا شيء | `role_scopes` + `check_scope` (20260926) |
| Approval | لا شيء | `approval_requests` + `exec_approval` (20260928) |
| Idempotency | يتطلب مفتاح | `idempotency_keys` (20260928) |
| Audit | سجلات CF | `admin_audit_logs` (§27) |
| DDoS/WAF | ✅ | — |
| Origin | ✅ (إخفاء/قفل) | أصل الدوال لا يمر إلا عبر CF |

**القاعدة الذهبية §38**: كل Endpoint جديد يُعرَّف ببياناته (permission/scope/approval/idempotency/audit) **ويُقابل** بطبقة CF المناسبة — لكن الإنفاذ النهائي في الـ Backend دائمًا.

---

## 13) خطوات التفعيل عند توفر حساب Cloudflare (Checklist)

1. إضافة Zone `bmba.com` وتحديث Nameservers عند المسجّل.
2. تطبيق `cloudflare/dns-records.json` (كلها Proxied).
3. تفعيل TLS Full (Strict) + Always HTTPS + HSTS.
4. تطبيق WAF + Rate Limits من `cloudflare/waf-rules.json` / `cloudflare/rate-limits.json`.
5. ربط Vercel + Supabase خلف CF واختبار Origin Protection (قسم 7).
6. توليد OpenAPI من العقد وتفعيل API Shield Schema Validation.
7. إنشاء Buckets R2 وربط الرفع.
8. إعداد بيئة Staging ثم الصعود.

> الملفات القابلة للتطبيق تحت `cloudflare/` — تُطبَّق عبر لوحة CF أو Terraform/API (مفتاح CF مطلوب).