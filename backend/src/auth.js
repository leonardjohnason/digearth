import crypto from 'node:crypto'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const secret = process.env.SESSION_SECRET || 'dev-secret-change-me'
const appId = process.env.WEIXIN_APP_ID || ''
const appSecret = process.env.WEIXIN_APP_SECRET || ''

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export function issueToken(player) {
  const body = b64url(JSON.stringify({ ...player, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS }))
  return `${body}.${sign(body)}`
}

export function verifyToken(token = '') {
  const [body, sig] = token.split('.')
  if (!body || !sig || sign(body) !== sig) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!parsed.openid || parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export async function exchangeWeixinCode(code) {
  if (appId && appSecret && code && !code.startsWith('dev-')) {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', appSecret)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')
    const response = await fetch(url)
    const data = await response.json()
    if (!response.ok || data.errcode || !data.openid) {
      throw new Error(data.errmsg || 'Weixin login failed')
    }
    return { openid: data.openid, unionid: data.unionid || null, source: 'weixin' }
  }

  // Local/dev fallback: lets the app run before real Weixin credentials are configured.
  const suffix = crypto.createHash('sha1').update(code || 'demo').digest('hex').slice(0, 12)
  return { openid: `dev_${suffix}`, unionid: null, source: 'dev' }
}

export function authMiddleware(req, _res, next) {
  const token = (req.header('authorization') || '').replace(/^Bearer\s+/i, '') || req.header('x-auth-token')
  const player = verifyToken(token)
  req.auth = player || null
  next()
}

export function requireAuth(req, res, next) {
  if (!req.auth?.openid) return res.status(401).json({ error: 'Weixin login required' })
  next()
}
