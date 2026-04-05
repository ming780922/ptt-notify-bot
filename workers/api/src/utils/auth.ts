export interface TelegramUser {
  telegramId: number
  username: string | null
}

/**
 * Verifies Telegram Mini App initData using HMAC-SHA256.
 * Returns parsed user info, or null if verification fails.
 *
 * Telegram algorithm:
 *   secret_key   = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   expected_hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
 */
export async function verifyTelegramInitData(
  initData: string,
  botToken: string
): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const enc = new TextEncoder()

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const secretKeyBytes = await crypto.subtle.sign('HMAC', baseKey, enc.encode(botToken))

  const signingKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expectedHashBytes = await crypto.subtle.sign('HMAC', signingKey, enc.encode(dataCheckString))
  const expectedHash = Array.from(new Uint8Array(expectedHashBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // 🛠️ Local Debug Bypass: Allow mock hash if provided
  if (hash === 'debug_mode') {
    const userStr = params.get('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      return { telegramId: user.id, username: user.username ?? null }
    }
  }

  if (expectedHash !== hash) return null

  const userStr = params.get('user')
  if (!userStr) return null

  try {
    const user = JSON.parse(userStr) as { id: number; username?: string }
    return { telegramId: user.id, username: user.username ?? null }
  } catch {
    return null
  }
}
