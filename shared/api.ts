export class ApiError extends Error {
  constructor(public status: number, public error: string, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

export type Api = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

/** JSON client for the restaurant API; sends cookies and turns error replies into ApiError. */
export function createApi(base: string, onUnauthorized?: () => void): Api {
  return async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(base + path, {
      credentials: 'include',
      ...init,
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    });
    if (res.status === 204) return null as T;
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 401) onUnauthorized?.();
      throw new ApiError(res.status, String(body.error ?? 'error'), String(body.message ?? res.statusText), body);
    }
    return body as T;
  };
}

export interface Booking {
  id: number; code: string; table_id: number; date: string; start: string; end: string;
  party: number; name: string; phone: string; comment: string;
  status: 'new' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'; source: string;
}
export interface TableRow { id: number; seats: number; label: string }
export interface Hours { open: string; close: string }
export interface Dish {
  id: number; section_id: number; name_en: string; name_local: string; desc_en: string; desc_local: string;
  price_cents: number; weight_g: number | null; out_of_stock: number; fire: number;
}
export interface Section { id: number; title_en: string; title_local: string; dishes: Dish[] }
