/** The landlord flow uses the newer Figma palette (beige + forest green), see `.theme-kiez` */
export default function LandlordLayout({ children }: LayoutProps<"/landlord">) {
  return (
    <div className="theme-kiez bg-background text-foreground flex flex-1 flex-col">
      {children}
    </div>
  )
}
