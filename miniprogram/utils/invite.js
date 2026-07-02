function timestampOf(value) {
  if (!value) return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return new Date(value).getTime()
  if (typeof value.getTime === 'function') return value.getTime()
  if (value.$date) return new Date(value.$date).getTime()
  return NaN
}

function isInviteActive(code, expiresAt, now = Date.now()) {
  const expiresAtMs = timestampOf(expiresAt)
  return Boolean(code) && Number.isFinite(expiresAtMs) && expiresAtMs > now
}

function reasonFromErrorCode(errorCode) {
  const reasons = {
    INVITE_EXPIRED: 'expired',
    INVITE_USED: 'used',
    INVITE_IN_USE: 'used',
    INVITE_INVALID: 'not_found'
  }
  return reasons[errorCode] || ''
}

module.exports = {
  isInviteActive,
  reasonFromErrorCode,
  timestampOf
}
