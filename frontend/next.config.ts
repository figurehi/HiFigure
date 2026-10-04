import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Keep `next build` from replacing the module graph used by a live `next dev`.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
  async redirects() {
    return [
      {
        source: "/apple-touch-icon-precomposed.png",
        destination: "/apple-icon.png",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
