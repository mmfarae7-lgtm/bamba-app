# Cloudflare × BMBA — ملفات الإعداد القابلة للتطبيق

> Cloudflare = **بوابة حماية** (DNS/CDN/DDoS/WAF/Rate Limit/API Shield/R2) أمام تطبيق BMBA.
> ليست بديلًا عن الـ Backend: إنفاذ المصادقة/RBAC/Nطاق/الموافقات يبقى في Supabase RLS + دوال الـ Backend
> (انظر `docs/admin-api-contract.md` وهجرات 20260926 / 20260928).

## الملفات

| الملف | المحتوى |
|---|---|
| `dns-records.json` | سجلات DNS: `bmba.com`, `www`, `api`, `admin`, staging — كلها Proxied |
| `waf-rules.json` | Managed Rulesets (OWASP) + Custom Rules (allowlist بلدان، حجب auth الغريبة، حماية admin، Skip للصحة/الثابت) |
| `rate-limits.json` | حدود لكل نقطة (`/auth/*`, `/predictions`, `/quiz/answers`, `/wallet/*`, `/payments/*`, `/admin/*`, قراءات عامة) مربوطة ببنود العقد |
| `caching.json` | TTL للثابت، API GET قصير + stale-while-revalidate، منع Cache للهوية/المحافظ، استراتيجية Purge |
| `r2-buckets.json` | توزيع R2 (صور اللاعبين/الفرق/البطولات/الجوائز/رفع المستخدمين/مرفقات الدعم) + سياسات Signed URL |
| `origin-security-checklist.md` | قائمة تحقق إخفاء وقفل الـ origin (Cloudflare IPs + Authenticated Origin Pulls + أسرار) |

## الربط بالوثائق

- `docs/cloudflare-architecture.md` ← المعماري الكامل والطبقات وبيئات Dev/Staging/Prod وخطوات التفعيل.
- `docs/admin-api-contract.md` ← مرجع العقد (§1–§38)؛ سياسات الـ Rate Limit تشير لكل قسم.
- الهجرات المنفّذة: `20260926_permission_rbac.sql` (RBAC/Scope/Approvals/Audit)، `20260928_api_contract_core.sql` (envelope + idempotency + exec_approval).

## التطبيق

```
1. أضف Zone "bmba.com" وحدّث Nameservers.
2. طبّق dns-records.json (كلها Proxied).
3. TLS Full (Strict) + Always HTTPS + HSTS.
4. طبّق waf-rules.json + rate-limits.json.
5. أكمل origin-security-checklist.md على Vercel و Supabase.
6. (لاحقًا) api.bmba.com أمام Supabase عبر Worker/Gateway + API Shield من OpenAPI.
7. أنشئ R2 buckets وحسّن الرفع (r2-buckets.json).
8. بيئة Staging ثم Promotion إلى Production.
```

> يتطلب التطبيق الآلي مفتاح Cloudflare API / حساب (Terraform أو Rulesets API).
> مفتاح الإدارة `sbp_...` المطبوع في محادثة سابقة **يجب إبطاله/تدويره** فورًا من إعدادات Supabase.