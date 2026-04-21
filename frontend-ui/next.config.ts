// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: {
    taint: true, // Prevents raw backend data leakage to the UI
  },
};

export default nextConfig;