namespace Slack.Events {
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
  type Event = import('@slack/web-api').SlackEvent
}
