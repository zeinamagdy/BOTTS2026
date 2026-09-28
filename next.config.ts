import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Kiez photos from Wikimedia Commons (data/derived/kiez-photos.json)
    remotePatterns: [{ protocol: "https", hostname: "**.wikimedia.org" }],
  },
}

export default nextConfig
