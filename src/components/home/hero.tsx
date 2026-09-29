import Image from "next/image"
import { FindKiezButton } from "@/components/home/find-kiez-button"
import { TornEdge } from "@/components/home/torn-edge"
import hero from "../../../public/home/hero.jpg"

export function Hero() {
  return (
    <section className="relative isolate flex h-[108vw] max-h-[1550px] min-h-[760px] flex-col items-center overflow-hidden">
      <Image
        src={hero}
        alt="A child in a helmet riding a bike on a country path outside the city"
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="-z-10 object-cover object-[50%_70%]"
      />
      {/* Keeps the white text readable on bright sky */}
      <div className="absolute inset-x-0 top-0 -z-10 h-2/3 bg-gradient-to-b from-black/35 to-transparent" />
      <div className="flex w-full max-w-[1120px] flex-col items-center gap-8 px-4 pt-32 text-center text-white sm:gap-10 sm:pt-[162px]">
        <p className="text-sm font-bold tracking-wide">
          HIDDEN GEMS FOR FAMILIES OUTSIDE THE RING
        </p>
        <h1 className="text-[3.25rem] leading-[0.9] font-medium text-balance sm:text-8xl lg:text-[128px]">
          LEAVE THE BERLIN CHAOS BEHIND
        </h1>
        <p className="max-w-[630px] text-lg leading-normal font-medium sm:text-xl">
          Tell us how your family likes to live, and we will help you discover
          areas outside the Berlin ring that still feel special
        </p>
        <FindKiezButton />
      </div>
      <TornEdge className="text-background absolute inset-x-0 -bottom-px h-auto w-full" />
    </section>
  )
}
