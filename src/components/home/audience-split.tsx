import { ArrowRightIcon } from "lucide-react"
import type { ReactNode } from "react"
import { CtaLink } from "@/components/home/cta-link"
import { cn } from "@/lib/utils"

function Side({
  id,
  eyebrow,
  title,
  text,
  cta,
  className,
  eyebrowClass,
  titleClass,
  textClass,
}: {
  id: string
  eyebrow: string
  title: string
  text: string
  cta: ReactNode
  className: string
  eyebrowClass: string
  titleClass: string
  textClass: string
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex flex-1 scroll-mt-8 flex-col items-start gap-6 p-6 sm:gap-8 sm:p-8",
        className,
      )}
    >
      <p className={cn("text-lg font-medium", eyebrowClass)}>{eyebrow}</p>
      <h2
        className={cn(
          "text-4xl leading-[1.1] text-balance sm:text-[52px]",
          titleClass,
        )}
      >
        {title}
      </h2>
      <p className={cn("text-lg", textClass)}>{text}</p>
      <div className="mt-auto">{cta}</div>
    </div>
  )
}

/** Two halves of one card: the renter side and the landlord side. */
export function AudienceSplit() {
  return (
    <section className="flex flex-col overflow-hidden rounded-3xl md:flex-row">
      <Side
        id="for-renters"
        eyebrow="FOR RENTERS"
        title="Where in Berlin should you actually look?"
        text="We suggest areas you may not have considered, with honest trade-offs, before you start searching for flats."
        cta={
          <CtaLink href="/find" icon={<ArrowRightIcon />}>
            Find suggestions
          </CtaLink>
        }
        className="bg-tint"
        eyebrowClass="text-brand-600"
        titleClass="text-heading"
        textClass="text-muted-foreground"
      />
      <Side
        id="for-landlords"
        eyebrow="FOR LANDLORDS"
        title="One fair shortlist. Condensed into a list."
        text="Every application is checked against your requirements, with the reasons behind each recommendation. Protected characteristics never count."
        cta={
          <CtaLink href="/landlord" tone="cream" icon={<ArrowRightIcon />}>
            Review applications
          </CtaLink>
        }
        className="bg-brand-500"
        eyebrowClass="text-brand-950"
        titleClass="text-brand-950"
        textClass="text-brand-950"
      />
    </section>
  )
}
