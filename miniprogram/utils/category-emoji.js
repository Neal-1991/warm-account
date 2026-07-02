const COMMON_EMOJIS = [
  '🍜', '🚗', '🛒', '🏠', '📱', '👶', '💄', '👗',
  '🎮', '🏋', '✈️', '🐱', '💊', '🎁', '📚', '➕',
  '💰', '🏆', '🏦', '📈', '💼', '🧧', '📦', '📌',
  '🎵', '☕', '🎂', '🏥', '📝', '💻'
]

function emojiFromIndex(emojis, event, fallback = '📌') {
  const index = Number(event?.currentTarget?.dataset?.index)
  return Number.isInteger(index) && emojis[index] ? emojis[index] : fallback
}

function emojiFromInput(event, fallback = '📌') {
  return event?.detail?.value || fallback
}

module.exports = {
  COMMON_EMOJIS,
  emojiFromIndex,
  emojiFromInput
}
