/** @type {import('next').NextConfig} */
const nextConfig = {
  // 告诉 Next.js 哪里是依赖的根目录
  experimental: {
    // 强制 Next.js/Turbopack 从项目的根目录开始解析依赖
    turbopack: {
      root: '../', // 从 frontend 目录向上退一级，即到 solana 根目录
    },
    // 如果您在前端引用了后端项目，还需要transpilePackages
    // transpilePackages: ['backend'], 
  }
};

module.exports = nextConfig;
