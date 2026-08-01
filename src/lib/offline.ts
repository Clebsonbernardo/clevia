// Offline support for CLEVIA work orders.
// Caches data in localStorage and queues finish actions to sync when online.

const CACHE_KEY = 'clevia:wo_cache';
const QUEUE_KEY = 'clevia:wo_pending_finishes';

export type PendingFinish = {
  id: string;
  work_order_id: string;
  company_id: string;
  defect: string;
  procedure: string;
  replaced_part: string;
  finished_at: string;
  actor_name: string;
  mechanic_id?: string | null;
};

type WOCache = {
  orders: unknown[];
  machines: unknown[];
  mechanics: unknown[];
  branches: unknown[];
  cached_at: string;
};

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function cacheWorkData(data: {
  orders: unknown[];
  machines: unknown[];
  mechanics: unknown[];
  branches: unknown[];
}, companyId: string) {
  try {
    const payload: WOCache = { ...data, company_id: companyId, cached_at: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // storage full or unavailable — non-critical
  }
}

export function getCachedWorkData(companyId: string): WOCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WOCache;
    if (parsed.company_id !== companyId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function queuePendingFinish(finish: PendingFinish) {
  try {
    const queue = getPendingFinishes();
    // remove any existing pending finish for the same work order
    const filtered = queue.filter((f) => f.work_order_id !== finish.work_order_id);
    filtered.push(finish);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch {
    // non-critical
  }
}

export function getPendingFinishes(): PendingFinish[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingFinish[];
  } catch {
    return [];
  }
}

export function removePendingFinish(id: string) {
  try {
    const queue = getPendingFinishes().filter((f) => f.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // non-critical
  }
}
