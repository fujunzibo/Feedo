/** @type {import('next').NextConfig} */
const nextConfig = {
  // 基本配置
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' http://localhost:3001 http://localhost:4000;"
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig

