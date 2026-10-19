import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MJML pulls in Node-only deps (html-minifier, juice); load it at runtime instead of bundling.
  serverExternalPackages: ["mjml"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // image uploads
};

export default nextConfig;
