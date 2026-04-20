// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  telemetry: false, // Disables Vercel telemetry
  images: { unoptimized: true }, // No external image optimization
  experimental: {
    taint: true, // Prevents raw backend data leakage to the UI
  },
};

export default nextConfig;