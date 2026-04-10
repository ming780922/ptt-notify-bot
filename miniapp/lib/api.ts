import { API_BASE } from './config'

let _initData = ''
export function setInitData(v: string) { _initData = v }

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'tma ' + _initData,
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'API error', data)
  return data as T
}
