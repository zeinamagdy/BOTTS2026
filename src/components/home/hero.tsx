import { ArrowRightIcon, BriefcaseBusinessIcon } from "lucide-react"
import Image from "next/image"
import { CtaLink } from "@/components/home/cta-link"
import hero from "../../../public/home/hero-park.jpg"

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[680px] flex-col items-center overflow-hidden sm:min-h-[860px] lg:h-[1058px]">
      <Image
        src={hero}
        alt="A park with a white lamp post and people walking in autumn sun"
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="-z-10 object-cover object-[50%_24%]"
      />
      {/* Keeps the white text readable, as in the design */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[62%] bg-gradient-to-b from-neutral-900 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-neutral-900/15" />
      <div className="flex w-full max-w-[1136px] flex-col items-center gap-10 px-4 pt-32 pb-20 text-center text-white sm:gap-16 sm:pt-[276px]">
        <div className="flex flex-col items-center gap-8">
          <p className="text-sm font-bold tracking-wide">
            BERLIN, SEEN IN A DIFFERENT LIGHT
          </p>
          <h1 className="text-[2.5rem] leading-[0.9] text-balance sm:text-7xl md:text-8xl lg:text-[128px]">
            Look beyond the neighbourhoods you already know.
          </h1>
          <p className="max-w-[630px] text-lg leading-normal font-medium sm:text-xl">
            Tell us how your family likes to live, and we will help you discover
            areas outside the Berlin ring that actually fit your everyday life.
          </p>
        </div>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <CtaLink href="/find" icon={<ArrowRightIcon />}>
            Find my Kiez
          </CtaLink>
          <CtaLink
            href="/landlord"
            tone="cream"
            icon={<BriefcaseBusinessIcon />}
          >
            I&apos;m a landlord
          </CtaLink>
        </div>
      </div>
    </section>
  )
}
