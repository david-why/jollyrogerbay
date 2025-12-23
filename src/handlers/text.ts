import type { KnownBlock, MessageEvent } from '@slack/types'
import {
  addMessageToCache,
  deleteMessageFromCache,
  getCachedMessages,
} from '../cache'
import app from '../client'
import { replaceInBlocks } from '../utils/blocks'

const { SLACK_OWNER, SLACK_USER_TOKEN } = process.env

async function maybeCacheMessage(payload: MessageEvent) {
  if (
    (!payload.subtype || payload.subtype === 'file_share') &&
    payload.user === SLACK_OWNER
  ) {
    addMessageToCache(payload)
  }

  if (
    payload.subtype === 'message_deleted' &&
    (!payload.previous_message.subtype ||
      payload.previous_message.subtype === 'file_share') &&
    payload.previous_message.user === SLACK_OWNER
  ) {
    deleteMessageFromCache(payload.channel, payload.previous_message.ts)
  }
}

async function replaceText(payload: MessageEvent) {
  if (payload.subtype && payload.subtype !== 'me_message') return

  const match = payload.text?.match(/^s\/([^/]+?)\/([^/]*?)$/)
  if (!match) return

  app.client.chat.delete({
    token: SLACK_USER_TOKEN,
    channel: payload.channel,
    ts: payload.ts,
  })

  const find = match[1]!
  const replace = match[2]!
  const thread_ts: string | undefined = (payload as any).thread_ts

  const message = getCachedMessages(payload.channel, thread_ts).find(
    (e) => !e.subtype || e.subtype === 'file_share'
  )
  if (!message) {
    await app.client.chat.postEphemeral({
      token: SLACK_USER_TOKEN,
      channel: payload.channel,
      thread_ts,
      user: SLACK_OWNER,
      text: "i didn't find any cached messages by you in this thread :c",
    })
  } else {
    const blocks = message.blocks
    if (blocks) {
      replaceInBlocks(blocks as KnownBlock[], find, replace)
    }
    const text = message.text?.replaceAll(find, replace)
    await app.client.chat.update({
      token: SLACK_USER_TOKEN,
      channel: message.channel,
      ts: message.ts,
      text,
      blocks: blocks || [],
    })
  }

  return true
}

const handlers: ((payload: MessageEvent) => Promise<boolean | void>)[] = [
  replaceText,
  // cache should probably be at the end
  maybeCacheMessage,
]

export default handlers
