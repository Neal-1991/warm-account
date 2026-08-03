// cloudfunctions/voice-entry/asr.js
// 腾讯云一句话识别（SentenceRecognition）服务端调用
// 使用云函数环境变量注入 SecretId/SecretKey，不进入小程序包或仓库

const crypto = require('crypto')
const https = require('https')

const ASR_ENDPOINT = 'asr.tencentcloudapi.com'
const ASR_SERVICE = 'asr'
const ASR_VERSION = '2019-06-14'
const ASR_ACTION = 'SentenceRecognition'
const ASR_REGION = 'ap-shanghai'
const ASR_TIMEOUT_MS = 15000

// 简单频率限制：单实例内存级，云函数实例间不共享，作为基础保护
const lastCallTimes = new Map() // openId -> timestamp
const MIN_INTERVAL_MS = 10000

function checkRateLimit(openId) {
  const now = Date.now()
  const last = lastCallTimes.get(openId) || 0
  if (now - last < MIN_INTERVAL_MS) {
    return false
  }
  lastCallTimes.set(openId, now)
  return true
}

function hmacSha256(key, message) {
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'utf8')
  return crypto.createHmac('sha256', keyBuffer).update(message, 'utf8').digest()
}

function buildSignedHeaders(payload, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const payloadStr = JSON.stringify(payload)

  const canonicalRequest = [
    'POST',
    '/',
    '',
    'content-type:application/json; charset=utf-8',
    'host:' + ASR_ENDPOINT,
    '',
    'content-type;host',
    crypto.createHash('sha256').update(payloadStr, 'utf8').digest('hex')
  ].join('\n')

  const credentialScope = `${date}/${ASR_SERVICE}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n')

  const secretDate = hmacSha256('TC3' + secretKey, date)
  const secretService = hmacSha256(secretDate, ASR_SERVICE)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Host': ASR_ENDPOINT,
    'X-TC-Action': ASR_ACTION,
    'X-TC-Version': ASR_VERSION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': ASR_REGION,
    'Authorization': authorization
  }
}

function httpsPost(payload, headers) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload)
    const req = https.request({
      hostname: ASR_ENDPOINT,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: ASR_TIMEOUT_MS
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(new Error('ASR 响应解析失败'))
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('ASR 请求超时'))
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

/**
 * 调用腾讯云一句话识别
 * @param {string} audioBase64 base64 编码的音频
 * @param {string} openId 用户标识，用于频率限制
 * @returns {Promise<Object>} { text, requestId }
 */
async function recognize(audioBase64, openId) {
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    const err = new Error('ASR 服务未配置')
    err.errorCode = 'ASR_NOT_CONFIGURED'
    throw err
  }

  if (!checkRateLimit(openId)) {
    const err = new Error('请求过于频繁，请稍后再试')
    err.errorCode = 'RATE_LIMITED'
    throw err
  }

  // SentenceRecognition 请求参数
  // ProjectId=0 默认项目；SubServiceType=2 一句话识别
  // EngSerViceType=16k_zh；SourceType=1 表示音频为 Base64
  // VoiceFormat=wav
  const payload = {
    ProjectId: 0,
    SubServiceType: 2,
    EngSerViceType: '16k_zh',
    SourceType: 1,
    VoiceFormat: 'wav',
    UsrAudioKey: openId + '-' + Date.now(),
    Data: audioBase64,
    DataLen: Buffer.byteLength(audioBase64, 'base64')
  }

  const headers = buildSignedHeaders(payload, secretId, secretKey)
  const res = await httpsPost(payload, headers)

  if (res.Response && res.Response.Error) {
    const errCode = res.Response.Error.Code
    const errMsg = res.Response.Error.Message
    console.error('ASR error:', { errCode, errMsg: String(errMsg).slice(0, 100) })
    // 鉴权或额度错误不重试
    if (/AuthFailure|LimitExceeded|ResourceUnavailable/.test(errCode)) {
      const err = new Error('识别服务暂不可用，请稍后重试')
      err.errorCode = 'ASR_SERVICE_UNAVAILABLE'
      throw err
    }
    const err = new Error('识别失败：' + errCode)
    err.errorCode = 'ASR_FAILED'
    throw err
  }

  const result = res.Response && res.Response.Result
  if (!result) {
    const err = new Error('ASR 返回为空')
    err.errorCode = 'ASR_EMPTY'
    throw err
  }

  return {
    text: result,
    requestId: res.Response.RequestId || ''
  }
}

module.exports = {
  recognize,
  checkRateLimit
}
