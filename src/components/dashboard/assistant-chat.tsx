"use client"

import {
  AlertCircleIcon,
  BabyIcon,
  CheckIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  HomeIcon,
  InfoIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MapPinIcon,
  ScaleIcon,
  SendIcon,
  ShieldIcon,
  SparklesIcon,
  TrendingUpIcon,
  TrophyIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { Streamdown } from "streamdown"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import type { ChatEvent } from "@/lib/chat-events"
import { cn } from "@/lib/utils"

type ToolPart = {
  type: "tool"
  id: string
  name: string
  args: unknown
  status: "running" | "done" | "error"
  summary?: string
  ms?: number
}
type Part = { type: "text"; text: string } | ToolPart
type Message = { role: "user" | "assistant"; parts: Part[] }

const TOOL_META: Record<string, { label: string; icon: LucideIcon }> = {
  rank_neighbourhoods: { label: "Ranked neighbourhoods", icon: TrophyIcon },
  get_neighbourhood_profile: { label: "Neighbourhood profile", icon: InfoIcon },
  search_rentals: { label: "Searched rentals", icon: KeyRoundIcon },
  search_properties_for_sale: {
    label: "Searched flats for sale",
    icon: HomeIcon,
  },
  lookup_address: { label: "Looked up address", icon: MapPinIcon },
  check_rent_fairness: { label: "Checked rent fairness", icon: ScaleIcon },
  get_price_trend: { label: "Price trend", icon: TrendingUpIcon },
  find_kitas: { label: "Found kitas", icon: BabyIcon },
  list_schools: { label: "Listed schools", icon: GraduationCapIcon },
  get_crime_by_area: { label: "Crime by area", icon: ShieldIcon },
}

const SUGGESTIONS = [
  "We're a family with a toddler, max €1,800 warm for 3 rooms. Where should we look?",
  "Is €1,150 cold for 62 m² at Oranienstraße 25 fair?",
  "Find 2-room flats under €1,000 warm near the U8",
  "How have rents in Prenzlauer Berg changed since 2020?",
]

const textOf = (m: Message) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("")

/** Applies one streamed event to the assistant message's parts (immutably). */
function applyEvent(parts: Part[], e: ChatEvent): Part[] {
  if (e.type === "text") {
    const last = parts.at(-1)
    return last?.type === "text"
      ? [...parts.slice(0, -1), { type: "text", text: last.text + e.delta }]
      : [...parts, { type: "text", text: e.delta }]
  }
  if (e.type === "tool_call") {
    return [
      ...parts,
      { type: "tool", id: e.id, name: e.name, args: e.args, status: "running" },
    ]
  }
  return parts.map((p) =>
    p.type === "tool" && p.id === e.id
      ? { ...p, status: e.ok ? "done" : "error", summary: e.summary, ms: e.ms }
      : p,
  )
}

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function send(text: string) {
    const content = text.trim()
    if (!content || loading) return
    const next: Message[] = [
      ...messages,
      { role: "user", parts: [{ type: "text", text: content }] },
    ]
    setMessages([...next, { role: "assistant", parts: [] }])
    setInput("")
    setLoading(true)

    abortRef.current = new AbortController()
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .map((m) => ({ role: m.role, content: textOf(m) }))
            .filter((m) => m.content),
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let parts: Part[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()!
        for (const line of lines) {
          if (line.trim()) parts = applyEvent(parts, JSON.parse(line))
        }
        setMessages([...next, { role: "assistant", parts }])
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error((err as Error).message || "Chat request failed")
        setMessages(next)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ring-foreground/10 flex h-[560px] flex-col rounded-xl ring-1">
      <ScrollArea className="min-h-0 flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <SparklesIcon className="text-primary size-8" />
            <p className="text-muted-foreground">
              Tell me what matters to you and I&apos;ll find your Kiez.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="bg-primary text-primary-foreground max-w-[85%] self-end rounded-xl px-4 py-2 text-sm"
                >
                  {textOf(m)}
                </div>
              ) : (
                <AssistantMessage
                  key={i}
                  message={m}
                  streaming={loading && i === messages.length - 1}
                />
              ),
            )}
          </div>
        )}
      </ScrollArea>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Budget, rooms, schools, commute, an address to check…"
          className="min-h-10 resize-none"
          rows={1}
        />
        {loading ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!input.trim()}
          >
            <SendIcon />
          </Button>
        )}
      </form>
    </div>
  )
}

function AssistantMessage({
  message,
  streaming,
}: {
  message: Message
  streaming: boolean
}) {
  const lastText = message.parts.findLastIndex((p) => p.type === "text")
  return (
    <div className="flex max-w-[85%] flex-col gap-2 self-start">
      {message.parts.length === 0 && (
        <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-xl px-4 py-2 text-sm">
          <LoaderCircleIcon className="size-4 animate-spin" /> Thinking…
        </div>
      )}
      {message.parts.map((p, i) =>
        p.type === "tool" ? (
          <ToolCall key={p.id} part={p} />
        ) : (
          <div key={i} className="bg-muted rounded-xl px-4 py-2 text-sm">
            <Streamdown isAnimating={streaming && i === lastText}>
              {p.text}
            </Streamdown>
          </div>
        ),
      )}
    </div>
  )
}

function ToolCall({ part }: { part: ToolPart }) {
  const meta = TOOL_META[part.name] ?? { label: part.name, icon: WrenchIcon }
  const Icon = meta.icon
  const args = argEntries(part.args)

  return (
    <details className="group bg-background rounded-lg border text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 select-none [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="font-medium">{meta.label}</span>
        {part.summary && (
          <span
            className={cn(
              "truncate",
              part.status === "error"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            · {part.summary}
          </span>
        )}
        <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1.5">
          {part.ms != null && (
            <span className="tabular-nums">{part.ms} ms</span>
          )}
          {part.status === "running" ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : part.status === "error" ? (
            <AlertCircleIcon className="text-destructive size-3.5" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </span>
      </summary>
      <div className="border-t px-3 py-2">
        <p className="text-muted-foreground mb-1 font-mono">{part.name}</p>
        {args.length === 0 ? (
          <p className="text-muted-foreground">No filters</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {args.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  )
}

/** Non-null arguments as [key, display value] pairs. Nested objects are flattened. */
function argEntries(args: unknown): [string, string][] {
  if (!args || typeof args !== "object")
    return args ? [["input", String(args)]] : []
  const fmt = (v: unknown): string | null => {
    if (v == null) return null
    if (Array.isArray(v)) return v.length ? v.join(", ") : null
    if (typeof v === "object") {
      const inner = Object.entries(v)
        .map(([k, x]) => [k, fmt(x)] as const)
        .filter(([, x]) => x != null)
        .map(([k, x]) => `${k}: ${x}`)
      return inner.length ? inner.join(", ") : null
    }
    return String(v)
  }
  return Object.entries(args)
    .map(([k, v]) => [k, fmt(v)] as const)
    .filter((e): e is [string, string] => e[1] != null)
}
