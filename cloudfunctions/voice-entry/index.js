// cloudfunctions/voice-entry/index.js
// 语音快速记账云函数：recognize（ASR）+ parse（规则优先 + Hy3 兜底）

const cloud = require('wx-server-sdk')
const { recognize, checkRateLimit } = require('./asr')
const { parseTranscript } = require('./local-parser')
const { parseWithHy3 } = require('./hy3-parser')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_AUDIO_BYTES = 1.5 * 1024 * 1024 // 1.5MB（约 30s wav）
const MAX_RECOGNIZE_RETRIES = 2

function getCollectionName(event, name) {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

async function getCategories(bookId, collectionName) {
  const res = await db.collection(collectionName('categories')).where({ bookId }).get()
  return res.data || []
}

exports.main = async (event, context) => {
  const { action, bookId, data = {} } = event
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID
  const collectionName = (name) => getCollectionName(event, name)
  const startedAt = Date.now()

  try {
    switch (action) {
      case 'recognize': {
        // 入参：{ fileID } 或 { audioBase64 }
        if (!bookId) return { success: false, error: 'bookId is required' }
        const { fileID, audioBase64 } = data
        if (!fileID && !audioBase64) {
          return { success: false, error: 'fileID or audioBase64 is required' }
        }

        // 用户级频率限制（在重试循环外，只检查一次，避免内部重试被自己挡住）
        if (!checkRateLimit(openId)) {
          return {
            success: false,
            error: '请求过于频繁，请稍后再试',
            errorCode: 'RATE_LIMITED'
          }
        }

        let base64Data = audioBase64
        let downloadedFileID = null
        try {
          // 从云存储下载音频
          if (fileID) {
            if (!fileID.startsWith('cloud://')) {
              return { success: false, error: 'invalid fileID' }
            }
            const file = await cloud.downloadFile({ fileID })
            if (!file?.fileContent) {
              return { success: false, error: 'audio file is empty', errorCode: 'AUDIO_EMPTY' }
            }
            if (file.fileContent.length > MAX_AUDIO_BYTES) {
              return { success: false, error: 'audio too long', errorCode: 'AUDIO_TOO_LONG' }
            }
            base64Data = file.fileContent.toString('base64')
            downloadedFileID = fileID
          }

          // 调用 ASR，带有限重试（仅网络瞬断）
          let asrResult = null
          let lastErr = null
          for (let attempt = 0; attempt <= MAX_RECOGNIZE_RETRIES; attempt++) {
            try {
              asrResult = await recognize(base64Data, openId)
              break
            } catch (err) {
              lastErr = err
              // 鉴权/额度/参数错误不重试
              if (['ASR_NOT_CONFIGURED', 'ASR_SERVICE_UNAVAILABLE'].includes(err.errorCode)) {
                break
              }
              // 最后一次失败抛出
              if (attempt === MAX_RECOGNIZE_RETRIES) break
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
            }
          }

          if (!asrResult) {
            console.error('ASR recognize failed:', {
              errorCode: lastErr?.errorCode || 'ASR_FAILED',
              errorMessage: String(lastErr?.message || lastErr || '').slice(0, 200),
              openId
            })
            const userError = lastErr?.errorCode === 'RATE_LIMITED'
              ? '请求过于频繁，请稍后再试'
              : '识别失败，请重试或转手工记账'
            return {
              success: false,
              error: userError,
              errorCode: lastErr?.errorCode || 'ASR_FAILED'
            }
          }

          const text = (asrResult.text || '').trim()
          if (!text) {
            return {
              success: false,
              error: '没有听清，请重新录音',
              errorCode: 'ASR_EMPTY_TEXT'
            }
          }

          return {
            success: true,
            transcript: text,
            asrRequestId: asrResult.requestId,
            duration: Date.now() - startedAt
          }
        } finally {
          // 无论成功失败，清理云存储临时音频
          if (downloadedFileID) {
            try {
              await cloud.deleteFile({ fileList: [downloadedFileID] })
            } catch (cleanupErr) {
              console.warn('temp audio cleanup failed:', cleanupErr.message)
            }
          }
        }
      }

      case 'parse': {
        // 入参：{ transcript, bookId }
        if (!bookId) return { success: false, error: 'bookId is required' }
        const { transcript } = data
        if (!transcript || typeof transcript !== 'string') {
          return { success: false, error: 'transcript is required' }
        }

        // 获取当前账本所有分类
        const categories = await getCategories(bookId, collectionName)

        // 1. 规则优先解析
        const ruleResult = parseTranscript(transcript, categories, { now: new Date() })

        // 2. 全部规则解析成功 → 直接返回
        if (!ruleResult.needsAI) {
          return {
            success: true,
            requestId: data.requestId || '',
            transcript,
            items: ruleResult.items,
            usedAI: false,
            duration: Date.now() - startedAt
          }
        }

        // 3. 规则无法完整解析 → Hy3 兜底
        let aiItems = []
        let aiError = null
        try {
          aiItems = await parseWithHy3(transcript, categories, { now: new Date() })
        } catch (err) {
          aiError = err.message
        }

        // 如果 Hy3 也失败，但规则已解析出部分 items，返回规则结果并标记警告
        if (aiError) {
          if (ruleResult.items.length > 0) {
            return {
              success: true,
              requestId: data.requestId || '',
              transcript,
              items: ruleResult.items,
              usedAI: false,
              warnings: ['部分内容未能解析，请检查或转手工记账'],
              duration: Date.now() - startedAt
            }
          }
          return {
            success: false,
            error: aiError,
            errorCode: 'PARSE_FAILED',
            transcript,
            duration: Date.now() - startedAt
          }
        }

        // 合并：规则已解析的 items + AI 解析的 items
        // 简化策略：若 AI 成功，直接用 AI 结果覆盖（AI 能处理更复杂语义）
        // 但保留规则的复杂语义警告（AA、转账等）
        const complexWarnings = ruleResult.items
          .filter(i => i.warnings && i.warnings.length > 0)
          .map(i => i.warnings[0])

        return {
          success: true,
          requestId: data.requestId || '',
          transcript,
          items: aiItems,
          usedAI: true,
          warnings: complexWarnings,
          duration: Date.now() - startedAt
        }
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('voice-entry error:', {
      action,
      stage: 'unexpected',
      errorCategory: 'internal',
      message: String(err.message || err).slice(0, 200)
    })
    return { success: false, error: '服务异常，请稍后重试', errorCode: 'INTERNAL_ERROR' }
  }
}
