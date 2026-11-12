'use client';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public issues?: unknown) {
    super(message);
  }
}

type LockListener = () => void;
const listeners = new Set<LockListener>();
export const onLocked = (fn: LockListener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** fetch wrapper: JSON in/out; a 423 means the PIN session lapsed → show the PIN pad. */
export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 423) listeners.forEach((l) => l());
    // Only a lost pharmacy login goes back to the sign-in page (never a wrong PIN or other check).
    if (res.status === 401 && data.code === 'NO_ACCOUNT') window.location.href = '/';
    if (res.status === 401 && data.code === 'NEEDS_CODE') window.location.href = '/?code=1';
    throw new ApiError(res.status, data.error || 'Something went wrong', data.code, data.issues);
  }
  return data as T;
}
