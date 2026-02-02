import crypto from 'crypto'

export const ADMIN_SESSION_COOKIE = 'admin_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

const timingSafeEqual = (a: string, b: string) => {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

const getAdminConfig = () => {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  if (!username || !password) {
    return null
  }
  return { username, password }
}

const getSessionSecret = () => {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || ''
}

const signPayload = (payload: string, secret: string) => {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export const verifyAdminCredentials = (username: string, password: string) => {
  const config = getAdminConfig()
  if (!config) return false
  return timingSafeEqual(username, config.username) && timingSafeEqual(password, config.password)
}

export const createAdminSession = (username: string) => {
  const secret = getSessionSecret()
  if (!secret) return null
  const payload = {
    u: username,
    exp: Date.now() + SESSION_TTL_MS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = signPayload(encoded, secret)
  return `${encoded}.${signature}`
}

export const verifyAdminSession = (token: string | undefined) => {
  if (!token) return false
  const secret = getSessionSecret()
  const config = getAdminConfig()
  if (!secret || !config) return false
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return false
  const expected = signPayload(encoded, secret)
  if (!timingSafeEqual(signature, expected)) return false

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (payload.u !== config.username) return false
    if (Date.now() > payload.exp) return false
    return true
  } catch {
    return false
  }
}
