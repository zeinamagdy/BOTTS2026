import { About, SiteFooter } from "@/components/home/about"
import { AudienceSplit } from "@/components/home/audience-split"
import { FairByDesign } from "@/components/home/fair-by-design"
import { Hero } from "@/components/home/hero"
import { HowItWorks } from "@/components/home/how-it-works"
import { SiteNav } from "@/components/home/site-nav"
import { Spotlight } from "@/components/home/spotlight"

/** Landing page from Figma (node 117:210), in the beige + green palette */
export default function Home() {
  return (
    <main className="theme-kiez bg-background text-foreground relative flex flex-1 flex-col">
      <SiteNav />
      <Hero />
      <div className="mx-auto flex w-full max-w-[1328px] flex-col gap-24 px-4 pt-16 sm:gap-36 sm:pt-36">
        <AudienceSplit />
        <Spotlight />
        <HowItWorks />
        <FairByDesign />
        <About />
        <SiteFooter />
      </div>
    </main>
  )
}
