import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/spiritlens",
  // assetPrefix: "/spiritlens",  // 如果静态资源 404 时取消注释
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
