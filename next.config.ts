import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Only applies if a proxy/middleware is ever added: it buffers request
    // bodies up to this size. Uploads are a <= 20 MiB .3dm plus a <= 512 KiB
    // .glb and multipart overhead. App Router route handlers have no limit.
    proxyClientMaxBodySize: "24mb",
  },
};

export default nextConfig;
