/**
 * Wire format of `/api/chat`: newline-delimited JSON, one event per line.
 * Shared by the route handler and `assistant-chat.tsx`.
 */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | {
      type: "tool_result"
      id: string
      ok: boolean
      summary: string
      ms: number
    }

export const encodeEvent = (e: ChatEvent) => `${JSON.stringify(e)}\n`
