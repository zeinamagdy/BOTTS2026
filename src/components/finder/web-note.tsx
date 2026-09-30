import { GlobeIcon } from "lucide-react"
import { getWebFindings } from "@/lib/finder-web"

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted flex flex-col gap-2 rounded-[12px] p-4 text-sm leading-normal">
      <p className="text-heading flex items-center gap-2 font-bold">
        <GlobeIcon aria-hidden className="text-brand-500 size-4" />
        From the web
      </p>
      {children}
    </div>
  )
}

export function WebNoteLoading({ wishes }: { wishes: string[] }) {
  return (
    <Frame>
      <p className="text-subtle animate-pulse">
        Looking up {wishes.join(", ")} near here…
      </p>
    </Frame>
  )
}

/**
 * One area's web findings for the noted wishes (lib/finder-web.ts). Streams in
 * after the cards; never part of the ranking.
 */
export async function WebNote({
  plrId,
  areasJson,
  wishes,
}: {
  plrId: string
  areasJson: string
  wishes: string[]
}) {
  const all = await getWebFindings(areasJson, JSON.stringify(wishes))
  if (!all)
    return (
      <Frame>
        <p className="text-subtle">
          Couldn’t look up {wishes.join(", ")} on the web right now.
        </p>
      </Frame>
    )
  const findings = all.get(plrId) ?? []
  const missing = wishes.filter((w) => !findings.some((f) => f.wish === w))
  return (
    <Frame>
      {findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {findings.map((f) => (
            <li key={f.wish} className="text-foreground">
              <span className="font-medium">{f.wish}:</span> {f.summary}{" "}
              <a
                href={f.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                {f.source.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <p className="text-subtle">Nothing found for {missing.join(", ")}.</p>
      )}
      <p className="text-faint text-xs">
        Web search, not checked by us and not part of the ranking.
      </p>
    </Frame>
  )
}
