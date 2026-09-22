// ============================================================
// طبقة تكامل عقد الـ API الإداري (docs/admin-api-contract.md)
// تطبيع الردود إلى { success, data, error, meta } حسب §2/§3،
// مع أدوات: فحص صلاحية على مورد (§9)، تنفيذ الموافقات (§10/§34)،
// و Idempotency (§35).
// ============================================================
import { supabase } from './supabase';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: ApiErrorShape;
  meta?: { request_id?: string };
}

export type ApiPromise<T> = Promise<ApiEnvelope<T>>;

/** استدعاء RPC إداري وتطبيع الناتج إلى غلاف العقد الموحّد */
export async function callAdmin<T = Record<string, unknown>>(
  fn: string,
  params: Record<string, unknown> = {},
): Promise<ApiEnvelope<T>> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) return { success: false, error: { code: 'RPC_ERROR', message: error.message } };

  const d = data as Record<string, unknown> | null;
  if (d && typeof d === 'object' && 'success' in d) {
    // غلاف موحّد جاهز من الـ Backend
    const env = d as unknown as ApiEnvelope<T>;
    return {
      success: Boolean(env.success),
      data: env.success ? (env.data as T) : null,
      error: env.success ? undefined : (env.error ?? { code: 'UNKNOWN_ERROR', message: 'خطأ غير معروف' }),
      meta: env.meta,
    };
  }
  if (d && typeof (d as { error?: unknown }).error === 'string') {
    // الرد القديم { error, message }
    const legacy = d as { error: string; message?: string; ok?: boolean };
    return { success: false, error: { code: legacy.error, message: legacy.message ?? legacy.error }, data: null };
  }
  // الرد القديم الناجح { ok: true, ... }
  return { success: Boolean(d && !(d as { ok?: boolean }).ok === false), data: (d ?? null) as T | null };
}

/** §9 فحص الصلاحية على مورد: { allowed, requires_approval, scope } */
export function adminAuthorizationCheck(
  permission: string,
  resourceType?: string,
  resourceId?: string,
): ApiPromise<{ permission: string; allowed: boolean; requires_approval: boolean; scope: { type: string; id?: string | null } }> {
  return callAdmin('admin_authorization_check', {
    p_permission: permission,
    p_resource_type: resourceType ?? null,
    p_resource_id: resourceId ?? null,
  });
}

/** §10/§34 تنفيذ طلب اعتماد معتمد (executing → completed) */
export function execApproval(
  requestId: string,
  note?: string,
): ApiPromise<{ user_id?: string; match_id?: string; amount?: number; balance_after?: number; payment_id?: string; refunded_amount?: number }> {
  return callAdmin('exec_approval', { p_request_id: requestId, p_reason: note ?? null });
}

/** §35 بدء عملية حساسة بمفتاح Idempotency (منع التنفيذ المزدوج) */
export function beginIdempotent(
  key: string,
  operation: string,
): ApiPromise<{ request_id?: string; already_processed?: boolean; processing?: boolean; response?: unknown }> {
  return callAdmin('begin_idempotent', { p_key: key, p_operation: operation });
}

/** §35 إكمال عملية حساسة وحفظ ناتجها ليردّ على أي طلب مكرر */
export function completeIdempotent(
  key: string,
  response?: unknown,
): ApiPromise<{ key: string; status: string }> {
  return callAdmin('complete_idempotent', { p_key: key, p_response: response ?? { ok: true } });
}