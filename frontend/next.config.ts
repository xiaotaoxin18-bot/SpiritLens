import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/spiritlens",
  // assetPrefix: "/spiritlens",  // 如果静态资源 404 时取消注释
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/ai-tool/canvas",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/ai-tool/canvas/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
