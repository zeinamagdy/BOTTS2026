import { connection } from "next/server"
import { Hero } from "@/components/home/hero"
import { HiddenGems } from "@/components/home/hidden-gems"
import { HowItWorks } from "@/components/home/how-it-works"
import { SiteNav } from "@/components/home/site-nav"
import { getHomeHighlights, type HomeHighlights } from "@/lib/queries"

async function loadHighlights(): Promise<HomeHighlights | null> {
  try {
    return await getHomeHighlights()
  } catch (err) {
    // The landing page still renders (static copy) when the DB is down
    console.error("getHomeHighlights failed:", (err as Error).message)
    return null
  }
}

export default async function Home() {
  await connection() // render per request (reads live DB data)
  const data = await loadHighlights()

  return (
    <main className="relative flex flex-1 flex-col">
      <SiteNav />
      <Hero />
      <HowItWorks spotlight={data?.gems[0] ?? null} />
      <HiddenGems
        gems={data?.gems ?? []}
        outsideRing={data?.outsideRing ?? null}
      />
    </main>
  )
}
