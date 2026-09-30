import { LogoWordmark } from "@/components/home/site-nav"
import { connection } from "next/server"
import { DatabaseIcon } from "lucide-react"
import { AssistantChat } from "@/components/dashboard/assistant-chat"
import { DistrictTable } from "@/components/dashboard/district-table"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { KiezMapLazy } from "@/components/dashboard/kiez-map-lazy"
import { RentChart } from "@/components/dashboard/rent-chart"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getBezirkSummary, getKiezProfiles, getOverview } from "@/lib/queries"

async function loadData() {
  try {
    const [overview, bezirke, kieze] = await Promise.all([
      getOverview(),
      getBezirkSummary(),
      getKiezProfiles(),
    ])
    return { overview, bezirke, kieze, error: null }
  } catch (err) {
    return {
      overview: null,
      bezirke: [],
      kieze: [],
      error: (err as Error).message,
    }
  }
}

export default async function Home() {
  await connection() // render per request (reads live DB data)
  const { overview, bezirke, kieze, error } = await loadData()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1>
              <LogoWordmark className="h-7" />
            </h1>
            <Badge variant="secondary">MVP</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Find the right Berlin neighbourhood: rents, schools, kitas, safety
            and transit for 193 postal codes.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {error || !overview || bezirke.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseIcon className="size-5" /> Database not ready
            </CardTitle>
            <CardDescription>
              Start Postgres and seed it:{" "}
              <code>npm run db:up && npm run db:setup</code>
            </CardDescription>
          </CardHeader>
          {error && (
            <CardContent>
              <pre className="text-muted-foreground text-xs whitespace-pre-wrap">
                {error}
              </pre>
            </CardContent>
          )}
        </Card>
      ) : (
        <>
          <KpiCards overview={overview} bezirke={bezirke} />
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="map">Kiez map</TabsTrigger>
              <TabsTrigger value="assistant">AI Assistant</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Cold rent by district</CardTitle>
                  <CardDescription>
                    Average asking rent, €/m² (synthetic listings)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RentChart bezirke={bezirke} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Districts</CardTitle>
                  <CardDescription>
                    Sorted from most to least affordable
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DistrictTable bezirke={bezirke} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="map">
              <KiezMapLazy kieze={kieze} />
            </TabsContent>

            <TabsContent value="assistant">
              <AssistantChat />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
