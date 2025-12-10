/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. 确保 Next.js 知道去根目录寻找依赖
  // 这个配置告诉 Next.js 编译非 node_modules 目录中的包
  // 'backend' 是您的另一个子项目的名称
  transpilePackages: ['backend'], 

  // 2. 移除或修正 'turbopack'
  experimental: {
    // 移除 turbopack.root，因为它导致了警告/错误。
    // 如果您需要其它实验性功能，请在此处添加。
    // root: '../', // Next.js 13/14+ 版本的正确 Workspaces 根目录设置
  }
}

module.exports = nextConfig;
