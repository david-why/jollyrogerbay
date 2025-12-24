import type { AppMentionEvent } from '@slack/web-api'
import app from '../client'
import { getSnippets, getValue, setSnippets, setValue } from '../database/kv'
import { transformEchoText } from '../utils/text'
import { broadcastMessageAsUser } from '../utils/slack'

const { SLACK_USER_TOKEN, SLACK_OWNER, SLACK_BOT_USER_ID, HACKCLUB_AI_KEY } =
  process.env

export async function delCommand(event: AppMentionEvent) {
  if (event.thread_ts) {
    await Promise.all([
      app.client.chat.delete({ channel: event.channel, ts: event.thread_ts }),
      app.client.chat.delete({
        channel: event.channel,
        ts: event.ts,
        token: SLACK_USER_TOKEN,
      }),
    ])
  } else {
    await app.client.chat.postEphemeral({
      channel: event.channel,
      user: event.user!,
      text: 'You can only delete a thread message',
    })
  }
}

export async function echoCommand(event: AppMentionEvent, text: string) {
  await Promise.all([
    app.client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: transformEchoText(text.substring(6)) },
        },
      ],
    }),
    app.client.chat.delete({
      channel: event.channel,
      ts: event.ts,
      token: SLACK_USER_TOKEN,
    }),
  ])
}

export async function channelCommand(event: AppMentionEvent, text: string) {
  await broadcastMessageAsUser(event, text, 'channel')
}

export async function hereCommand(event: AppMentionEvent, text: string) {
  await broadcastMessageAsUser(event, text, 'here')
}

export async function watchCommand(event: AppMentionEvent, text: string) {
  await app.client.chat.delete({
    channel: event.channel,
    ts: event.ts,
    token: SLACK_USER_TOKEN,
  })
  const args = text.substring(6).trim()
  const userIdMatch = args.match(/<@(U[0-9A-Z]+)>/)
  if (!userIdMatch) {
    await app.client.chat.postEphemeral({
      channel: event.channel,
      user: SLACK_OWNER,
      text: 'no user provided </3',
    })
    return
  }
  const [, userId] = userIdMatch
  const watched =
    (await getValue<Record<string, string>>('watched_users')) || {}
  watched[userId!] = 'new'
  await setValue('watched_users', watched)
  await app.client.chat.postEphemeral({
    channel: event.channel,
    user: SLACK_OWNER,
    text: `started watching <@${userId}>!`,
  })
}

export async function unwatchCommand(event: AppMentionEvent, text: string) {
  await app.client.chat.delete({
    channel: event.channel,
    ts: event.ts,
    token: SLACK_USER_TOKEN,
  })
  const args = text.substring(6).trim()
  const userIdMatch = args.match(/<@(U[0-9A-Z]+)>/)
  if (!userIdMatch) {
    await app.client.chat.postEphemeral({
      channel: event.channel,
      user: SLACK_OWNER,
      text: 'no user provided </3',
    })
    return
  }
  const [, userId] = userIdMatch
  const watched =
    (await getValue<Record<string, string>>('watched_users')) || {}
  if (userId! in watched) {
    delete watched[userId!]
  }
  await setValue('watched_users', watched)
  await app.client.chat.postEphemeral({
    channel: event.channel,
    user: SLACK_OWNER,
    text: `stopped watching <@${userId}>!`,
  })
}

export async function aiCommand(event: AppMentionEvent, text: string) {
  if (!HACKCLUB_AI_KEY) {
    return app.client.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      user: SLACK_OWNER,
      text: 'No AI API key set.',
    })
  }
  const res = (await fetch(
    'https://ai.hackclub.com/proxy/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HACKCLUB_AI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: text }],
        max_tokens: 500,
      }),
    }
  ).then((res) => res.json())) as any
  console.log(res)
  return app.client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: res.choices[0].message.content,
    blocks: [
      {
        type: 'markdown',
        text: res.choices[0].message.content,
      },
    ],
  })
}

export async function addSnippetCommand(event: AppMentionEvent, text: string) {
  const [, key, ...valueParts] = text.split(' ')
  if (!key || !valueParts.length) {
    return app.client.chat.postEphemeral({
      user: SLACK_OWNER,
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: `usage: <@${SLACK_BOT_USER_ID}> /addsnippet !key some value`,
    })
  }
  const value = valueParts.join(' ')

  const snippets = await getSnippets()
  snippets[key] = value
  await setSnippets(snippets)

  await Promise.all([
    app.client.chat.postEphemeral({
      user: SLACK_OWNER,
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: `\`${key}\` added (\`${value}\`)!`,
    }),
    app.client.reactions.add({
      channel: event.channel,
      timestamp: event.ts,
      name: 'white_check_mark',
    }),
  ])
}

export async function delSnippetCommand(event: AppMentionEvent, text: string) {
  const key = text.split(' ')[1]!

  const snippets = await getSnippets()
  if (key in snippets) {
    delete snippets[key]
    await setSnippets(snippets)
    await Promise.all([
      app.client.chat.postEphemeral({
        user: SLACK_OWNER,
        channel: event.channel,
        thread_ts: event.thread_ts,
        text: `\`${key}\` removed!`,
      }),
      app.client.reactions.add({
        channel: event.channel,
        timestamp: event.ts,
        name: 'white_check_mark',
      }),
    ])
  } else {
    await Promise.all([
      app.client.chat.postEphemeral({
        user: SLACK_OWNER,
        channel: event.channel,
        thread_ts: event.thread_ts,
        text: `\`${key}\` not found`,
      }),
      app.client.reactions.add({
        channel: event.channel,
        timestamp: event.ts,
        name: 'bangbang',
      }),
    ])
  }
}

export async function snippetsCommand(event: AppMentionEvent) {
  app.client.chat.delete({
    token: SLACK_USER_TOKEN,
    channel: event.channel,
    ts: event.ts,
  })

  const snippets = Object.entries(await getSnippets())

  const text = snippets.length
    ? `All snippets: \n${snippets.map(([key, value]) => `- \`${key}\` (\`${value}\`)`).join('\n')}`
    : 'There are no snippets.'

  await app.client.chat.postEphemeral({
    channel: event.channel,
    thread_ts: event.thread_ts,
    user: SLACK_OWNER,
    text,
  })
}
