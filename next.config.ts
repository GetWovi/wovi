import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Builder uploads (sample files, board images) go through server actions; the limits in src/lib/builder/storage.ts are stricter than this.
  // Clips (up to 200 MB) do not: they stream to disk through the route handler at /builder/clips/upload.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // ffmpeg for clip samples ships as a binary inside this package; it must stay in node_modules, not in a bundle.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
