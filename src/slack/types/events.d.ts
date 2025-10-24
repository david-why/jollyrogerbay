namespace Slack.Events {
  namespace Events {
    interface AppMention {
      user: string
      type: 'app_mention'
      ts: string
      client_msg_id: string
      text: string
      team: string
      blocks: Slack.BlockKit.Block[]
      channel: string
      event_ts: string
    }
  }

  interface URLVerificationRequest {
    token: string
    challenge: string
    type: 'url_verification'
  }

  interface EventCallbackRequest {
    token: string
    team_id: string
    api_app_id: string
    event: Event
    type: 'event_callback'
    event_id: string
    event_time: number
    authorizations: unknown[] // TODO
    is_ext_shared_channel: boolean
    event_context: string
  }

  type Request = URLVerificationRequest | EventCallbackRequest
  type Event = Events.AppMention
}
