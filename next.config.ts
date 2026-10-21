import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Builder uploads (sample files, board images) go through server actions; the limits in src/lib/builder/storage.ts are stricter than this.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
