export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Secret',
  'Access-Control-Max-Age': '86400',
} as const

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status)
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS }
  })
}
