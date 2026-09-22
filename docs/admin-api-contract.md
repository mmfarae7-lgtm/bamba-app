# BMBA Admin API Contract — RBAC · Scope · Approval · Audit · Ledger · Idempotency

> مرجع موحّد (Backend / Frontend / QA) — بتاريخ 2026-09-22.
> المصدر: مواصفات المنتج. كل Endpoint إداري يجب أن يمر عبر:
> `Authentication → Admin Session → Permission → Scope → Approval (if required) → Business Logic → Transaction → Audit Log`

---

## 1) المعايير العامة

- `base_url`: `/api/v1`
- `admin_base_url`: `/api/v1/admin`
- `authentication`: `Authorization: Bearer <access_token>` (JWT)
- `content_type`: `application/json`
- `idempotency`: ترويسة `Idempotency-Key` مطلوبة لـ:
  - تعديلات المحفظة (wallet adjustments)
  - المدفوعات والاستردادات (payments / refunds)
  - تعديلات النقاط (point adjustments)
  - كل العمليات الحساسة

## 2) Standard Response Contract

نجاح:

```json
{ "success": true, "data": {}, "meta": { "request_id": "req_01HX..." } }
```

قائمة:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 25, "total": 240, "total_pages": 10, "request_id": "req_01HX..." }
}
```

خطأ:

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "You do not have permission to perform this action.", "details": {} },
  "meta": { "request_id": "req_01HX..." }
}
```

## 3) Error Codes

```
UNAUTHENTICATED | FORBIDDEN | ACCOUNT_SUSPENDED | SESSION_EXPIRED | INVALID_2FA
VALIDATION_ERROR | NOT_FOUND | CONFLICT | ALREADY_EXISTS | RESOURCE_LOCKED
SCOPE_DENIED | APPROVAL_REQUIRED | APPROVAL_PENDING | SELF_APPROVAL_NOT_ALLOWED
IDEMPOTENCY_CONFLICT | INVALID_STATE | RATE_LIMITED | INTERNAL_ERROR
```

## 4) Admin Authentication API

| Method | Path | Permission |
|---|---|---|
| POST | `/admin/auth/login` | Public |
| POST | `/admin/auth/2fa/verify` | — |
| POST | `/admin/auth/refresh` | — |
| POST | `/admin/auth/logout` | Bearer |
| GET | `/admin/auth/me` | Bearer |

- `POST /admin/auth/login` `{ "email": "...", "password": "..." }` →
  `{ "requires_2fa": true, "challenge_id": "2fa_ch_123" }`
- `POST /admin/auth/2fa/verify` `{ "challenge_id": "...", "code": "123456" }` →
  `{ "access_token", "refresh_token", "expires_in": 3600, "admin": { "id", "display_name", "roles": [...], "permissions": [...] } }`
- `GET /admin/auth/me` → `{ "id", "display_name", "roles": [{ "name", "scope": { "type": "global" } }], "permissions": [...], "two_factor_enabled": true }`

## 5) Permission API

- `GET /admin/permissions` — Permission: `security.view_events`
- عنصر: `{ "id": "perm_1", "key": "users.view", "resource": "users", "action": "view" }`

## 6) Roles API

- `GET /admin/roles` (Permission: `security.view_events`)
- `POST /admin/roles` (Permission: `roles.create`)
  - `{ "name": "regional_competition_manager", "display_name_ar": "مدير بطولات إقليمي", "display_name_en": "...", "permissions": ["matches.view", ...] }`
- `GET /admin/roles/:roleId`
- `PATCH /admin/roles/:roleId`
- `DELETE /admin/roles/:roleId` — الحذف الفعلي ممنوع للأدوار النظامية: `RESOURCE_LOCKED`

## 7) Admin Users API

- `GET /admin/admin-users` — Filters: `status, role, search, scope, created_from, created_to` (Permission: `security.view_admin_sessions`)
- `POST /admin/admin-users`
  - `{ "email", "display_name", "roles": [{ "role_id", "scope": { "type": "competition", "id": "..." }, "expires_at": null }], "require_2fa": true }`
- `PATCH /admin/admin-users/:id`
- `POST /admin/admin-users/:id/roles` — `{ "role_id", "scope": { "type", "id" }, "expires_at": "2027-01-01T00:00:00Z" }`
- `DELETE /admin/admin-users/:id/roles/:roleId`

## 8) Scope API

- `GET /admin/admin-users/:id/scopes`
- `POST /admin/admin-users/:id/scopes` — `{ "role_id", "scope_type": "competition", "scope_id": "competition_123", "expires_at": null }`
- `DELETE /admin/admin-users/:id/scopes/:scopeId`

## 9) Permission Check API

- `POST /admin/authorization/check` — `{ "permission": "matches.set_result", "resource": { "type": "match", "id": "match_123" } }`
- Response: `{ "allowed": true, "requires_approval": true, "scope": { "type": "competition", "id": "competition_123" } }`
- Endpoint مساعد للواجهة فقط — ليس بديلاً عن Authorization Middleware في الـ Backend.

## 10) Approval API

- `GET /admin/approvals` — Filters: `status, request_type, resource_type, requested_by, created_from, created_to`
- `POST /admin/approvals` — مثال `wallet_adjustment`:
  ```json
  {
    "request_type": "wallet_adjustment",
    "resource_type": "wallet",
    "resource_id": "wallet_123",
    "reason": "تصحيح عملية مكافأة",
    "request_data": { "direction": "credit", "amount": 500, "currency": "BAMBAT" }
  }
  ```
  → `{ "approval_id": "approval_123", "status": "pending" }`
- `GET /admin/approvals/:id`
- `POST /admin/approvals/:id/approve` — `{ "reason": "..." }`
- `POST /admin/approvals/:id/reject` — `{ "reason": "..." }`
- **قاعدة**: `if (requestedBy === reviewerId) throw SELF_APPROVAL_NOT_ALLOWED;`

## 11) Users API

- `GET /admin/users` | `GET /admin/users/:id` | `PATCH /admin/users/:id`
- `POST /admin/users/:id/suspend` — `{ "reason": "مخالفة شروط الاستخدام" }`
- `POST /admin/users/:id/unsuspend`
- `POST /admin/users/:id/force-logout`
- `GET /admin/users/:id/activity`
- `GET /admin/users/export`

## 12) Matches API

- `GET /admin/matches` | `POST /admin/matches` | `GET /admin/matches/:id` | `PATCH /admin/matches/:id` | `DELETE /admin/matches/:id`
- `POST /admin/matches/:id/publish` | `cancel` | `postpone`
- `POST /admin/matches/:id/predictions/lock` | `predictions/reopen`
- `POST /admin/matches/:id/result`
  - `{ "home_score": 2, "away_score": 1, "status": "finished" }`
- `POST /admin/matches/:id/result/correction`
  - `{ "home_score": 3, "away_score": 1, "reason": "تصحيح النتيجة الرسمية" }`

عملية النتيجة تمر عبر: `Permission → Approval → Update Match → Recalculate Predictions → Recalculate Points → Update Ledgers → Audit`

## 13) Predictions API

- `GET /admin/predictions` | `GET /admin/predictions/:id` | `GET /admin/predictions/export`
- `POST /admin/predictions/:id/correct` | `POST /admin/predictions/:id/invalidate`

## 14) Points API

- `GET /admin/points` | `GET /admin/points/rules` | `PATCH /admin/points/rules`
- `POST /admin/points/recalculate` | `adjust` | `freeze` | `unfreeze`
- `GET /admin/points/export`
- **القاعدة الذهبية**: لا يُعدَّل الرصيد مباشرة — بل:
  `points_adjustment → points_ledger → new_balance`

## 15) Bambat / Wallet API

- `GET /admin/wallets` | `GET /admin/wallets/:id` | `GET /admin/wallets/:id/transactions`
- `POST /admin/wallets/:id/adjust`
  - `{ "direction": "credit", "amount": 500, "reason": "مكافأة يدوية" }`
  - → `{ "approval_required": true, "approval_id": "approval_123" }`
- `POST /admin/wallets/:id/freeze` | `unfreeze`
- `GET /admin/wallets/suspicious` | `GET /admin/wallets/export`

## 16) Payments API

- `GET /admin/payments` | `GET /admin/payments/:id`
- `POST /admin/payments/:id/review` | `approve` | `reject` | `refund`
  - Refund: `{ "amount": 20, "reason": "طلب استرجاع" }` — يتطلب `Idempotency-Key: refund_123456`
- `GET /admin/payments/export`

## 17) Challenges API

- `GET /admin/challenges` | `POST` | `GET /:id` | `PATCH /:id`
- `POST /admin/challenges/:id/publish` | `pause` | `end`
- `GET /admin/challenges/:id/members` | `rewards`
- `PATCH /admin/challenges/:id/rewards`
- يشمل: حلبات بمبا · أنت المدرب · Quiz · أي Challenge مستقبلي

## 18) Fantasy API

- `GET /admin/fantasy/seasons` | `POST` | `PATCH /:id`
- `GET /admin/fantasy/players` | `PATCH /admin/fantasy/players/:id/price`
- `GET /admin/fantasy/rules` | `PATCH /admin/fantasy/rules`
- `POST /admin/fantasy/recalculate-points`
- `GET /admin/fantasy/transfers` | `GET /admin/fantasy/export`
- **فصل صارم**: `Fantasy Budget ≠ Bambat ≠ Points`

## 19) Quiz API

- `GET /admin/quiz/questions` | `POST` | `GET /:id` | `PATCH /:id` | `DELETE /:id`
- `POST /admin/quiz/questions/:id/publish` | `unpublish`
- `PATCH /admin/quiz/questions/:id/answers` | `PATCH /admin/quiz/rewards`
- مثال: `{ "question": "...", "options": [...], "correct_option": 0, "time_limit_seconds": 45 }`

## 20) Store API

- `GET /admin/store/products` | `POST` | `GET /:id` | `PATCH /:id` | `POST /:id/archive`
- `GET /admin/store/inventory` | `PATCH /admin/store/inventory/:id`
- `GET /admin/store/orders` | `GET /:id` | `POST /admin/store/orders/:id/cancel`

## 21) Prizes API

- `GET /admin/prizes` | `POST` | `PATCH /:id` | `POST /:id/archive`
- `GET /admin/prize-redemptions`
- `POST /admin/prize-redemptions/:id/approve` | `reject` | `ready` | `delivered`

## 22) Partners / Coupons

Partners:
- `GET /admin/partners` | `POST` | `GET /:id` | `PATCH /:id` | `POST /:id/publish` | `archive`

Coupons:
- `GET /admin/coupons` | `POST` | `GET /:id` | `PATCH /:id` | `POST /:id/disable`
- `GET /admin/coupons/redemptions`

## 23) Notifications API

- `GET /admin/notifications` | `POST /admin/notifications`
  - `{ "title": "تحديث جديد", "body": "تم إضافة مباريات جديدة", "audience": { "type": "all" } }`
- `POST /admin/notifications/:id/send` | `schedule` | `cancel`
- `GET /admin/notifications/history`

## 24) CMS API

- `GET /admin/cms/pages` | `POST` | `GET /:id` | `PATCH /:id`
- `POST /admin/cms/pages/:id/publish` | `unpublish` | `archive`

## 25) Support API

- `GET /admin/support/tickets` | `GET /:id`
- `POST /admin/support/tickets/:id/assign` | `reply` | `close` | `reopen`
- `GET /admin/support/export`

## 26) Reports API

- `GET /admin/reports/overview` | `users` | `predictions` | `wallet` | `challenges` | `financial` | `support`
- `GET /admin/reports/export`
- كل تقرير يدعم: `from, to, competition_id, challenge_id, country, status, format`

## 27) Audit API

- `GET /admin/audit-logs` | `GET /:id` | `GET /admin/audit-logs/export`
- عنصر:
  ```json
  {
    "action": "wallet.adjustment.approved",
    "resource_type": "wallet",
    "resource_id": "wallet_123",
    "admin_user_id": "admin_456",
    "request_id": "req_123",
    "old_values": { "balance": 1000 },
    "new_values": { "balance": 1500 },
    "reason": "مكافأة"
  }
  ```
- **لا يوجد** `DELETE /admin/audit-logs/:id` ولا `PATCH /admin/audit-logs/:id`

## 28) Security API

- `GET /admin/security/events` | `GET /admin/security/sessions` | `POST /admin/security/sessions/:id/revoke`
- `POST /admin/security/admins/:id/lock` | `unlock`
- `POST /admin/security/admins/:id/2fa/enable` | `disable`

## 29) Settings API

- `GET /admin/settings` | `PATCH /admin/settings`
- `GET /admin/settings/feature-flags` | `PATCH /admin/settings/feature-flags/:key`
- `GET /admin/settings/integrations` | `PATCH /admin/settings/integrations/:id`

## 30) Maintenance / Versions

- `GET /admin/maintenance` | `POST` | `PATCH /:id`
- `POST /admin/maintenance/:id/activate` | `deactivate`
- `GET /admin/app-versions` | `POST` | `PATCH /:id`
- `POST /admin/app-versions/:id/force-update`

## 31) Authorization Middleware (المقترح)

```ts
export const authorize =
  (permission: Permission) =>
  async (req, res, next) => {
    const admin = req.admin;
    if (!admin) return next(new ApiError("UNAUTHENTICATED", 401));
    const allowed = await authorizationService.check({
      adminUserId: admin.id,
      permission,
      resource: { type: req.resourceType, id: req.params.id }
    });
    if (!allowed) return next(new ApiError("FORBIDDEN", 403));
    next();
  };
```

الاستخدام:

```ts
router.post(
  "/matches/:id/result",
  authenticateAdmin,
  authorize("matches.set_result"),
  requireApprovalIfNeeded(),
  setMatchResult
);
```

## 32) Resource Authorization (مثال النطاق)

مدير بطولة لديه `matches.set_result` لكن فقط `competition_id = 123`:

```
POST /admin/matches/match_999/result
  → match_999 → competition_id = 456
  → admin scope = competition_123
  → SCOPE_DENIED
```

## 33) Approval Middleware

```ts
async function requireApprovalIfNeeded(context) {
  if (!APPROVAL_REQUIRED.includes(context.permission)) return { required: false };
  const approval = await createApprovalRequest(context);
  return { required: true, approval_id: approval.id };
}
```

للعمليات الحساسة جداً: لا ينفَّذ الـ Endpoint أصلاً حتى الموافقة:

```
POST /wallets/:id/adjust → 201 Approval Created
POST /approvals/:id/approve → Transaction Executed
```

## 34) State Machine (الموافقات)

```
pending → approved → executing → completed
pending → rejected
pending → expired
```

يمنع تنفيذ العملية نفسها مرتين.

## 35) Idempotency

```
POST /admin/wallets/wallet_123/adjust   (Idempotency-Key: 8f4c-1234)
```

إعادة نفس الطلب:

```json
{ "success": true, "data": { "operation_id": "op_123", "already_processed": true } }
```

بدلاً من إضافة البمبات مرتين.

## 36) Audit Event

```json
{
  "event": "admin.action.completed",
  "request_id": "req_123",
  "admin_user_id": "admin_123",
  "permission": "wallets.adjust",
  "resource_type": "wallet",
  "resource_id": "wallet_123",
  "approval_id": "approval_456",
  "ip": "masked",
  "timestamp": "2026-09-22T12:00:00Z"
}
```

## 37) الهيكل البرمجي المقترح للـ Backend

```
src/
├── modules/admin/{ auth, users, roles, permissions, scopes, approvals, matches,
│   competitions, predictions, points, wallets, payments, challenges, arenas,
│   fantasy, quiz, store, prizes, partners, coupons, notifications, cms,
│   support, reports, security, audit, settings, maintenance }
├── core/{ auth, authorization, approvals, audit, ledger, idempotency, transactions, errors }
└── routes/admin.ts
```

## 38) القاعدة الذهبية في BMBA

كل Endpoint جديد يُعرَّف معه منذ البداية:

```ts
{
  method: "POST",
  path: "/admin/wallets/:id/adjust",
  permission: "wallets.adjust",
  scope: { type: "global" },
  approval: { required: true, selfApproval: false },
  idempotency: true,
  transaction: true,
  audit: { event: "wallet.adjustment" }
}
```