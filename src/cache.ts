import type { MessageEvent } from '@slack/web-api'

const MESSAGE_CACHE_SIZE = 100

// sorted by ts desc
const messagesCache: MessageEvent[] = []

// todo: more performance please
function updateMessageCache() {
  messagesCache.sort((a, b) => Number(b.ts) - Number(a.ts))
  if (messagesCache.length > MESSAGE_CACHE_SIZE) {
    messagesCache.pop()
  }
}

export function addMessageToCache(message: MessageEvent) {
  messagesCache.splice(0, 0, message)
  updateMessageCache()
}

export function deleteMessageFromCache(channel: string, ts: string) {
  const index = messagesCache.findIndex(
    (m) => m.channel === channel && m.ts === ts
  )
  if (index >= 0) {
    messagesCache.splice(index, 1)
  }
}

export function getCachedMessages(channel: string, thread?: string) {
  return messagesCache.filter(
    (m) => m.channel === channel && (m as any).thread_ts === thread
  )
}
