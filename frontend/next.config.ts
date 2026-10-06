import type { NextConfig } from "next";

const backendOrigin = process.env.BACKEND_API_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return backendOrigin
      ? [{ source: "/api/:path*", destination: `${backendOrigin}/api/:path*` }]
      : [];
  },
};

export default nextConfig;
