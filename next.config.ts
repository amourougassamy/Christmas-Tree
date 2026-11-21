import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Only applies if a proxy/middleware is ever added: it buffers request
    // bodies up to this size. Uploads are a <= 512 KiB GLB plus multipart
    // overhead. App Router route handlers have no limit.
    proxyClientMaxBodySize: "2mb",
  },
};

export default nextConfig;
