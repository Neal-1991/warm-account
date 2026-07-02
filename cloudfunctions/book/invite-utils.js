const INVITE_TTL_MS = 60 * 60 * 1000

const INVITE_ERRORS = {
  INVALID: ['INVITE_INVALID', '邀请码无效'],
  EXPIRED: ['INVITE_EXPIRED', '邀请码已过期'],
  USED: ['INVITE_USED', '该邀请已被使用'],
  IN_USE: ['INVITE_IN_USE', '该邀请正在被其他用户使用']
}

function timestampOf(value) {
  if (!value) return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return new Date(value).getTime()
  if (typeof value.getTime === 'function') return value.getTime()
  if (value.$date) return new Date(value.$date).getTime()
  return NaN
}

function isInviteExpired(expiresAt, now = Date.now()) {
  const expiresAtMs = timestampOf(expiresAt)
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now
}

function inviteError(type) {
  const [code, message] = INVITE_ERRORS[type] || INVITE_ERRORS.INVALID
  const error = new Error(message)
  error.code = code
  return error
}

function inviteErrorResult(type, reason) {
  const error = inviteError(type)
  return {
    success: false,
    error: error.message,
    errorCode: error.code,
    reason: reason || type.toLowerCase()
  }
}

async function generateUniqueInviteCode(exists, random = Math.random) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(random() * 900000) + 100000)
    if (!await exists(code)) {
      return code
    }
  }
  const error = new Error('暂时无法生成邀请码，请稍后重试')
  error.code = 'INVITE_GENERATION_FAILED'
  throw error
}

module.exports = {
  INVITE_TTL_MS,
  generateUniqueInviteCode,
  inviteError,
  inviteErrorResult,
  isInviteExpired,
  timestampOf
}
