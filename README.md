================================================================================
                              Solana3 项目说明
================================================================================

项目名称: solana3
版本: 1.0.0
描述: 基于 Solana 区块链的 Feedo Fund 服务及 pump.fun 风格前端应用

--------------------------------------------------------------------------------
一、项目概述
--------------------------------------------------------------------------------
本项目是一个 monorepo 形式的 Solana 区块链应用，包含后端服务、两个独立的
前端应用以及共享代码模块。后端提供代币创建、国库管理、自动兑换、定期转账、
WebSocket 推送等功能；前端提供 Swap、Exchange、Pump 代币创建与交易页面。

项目主要使用 TypeScript + Node.js + Next.js + Prisma + Solana Web3.js 开发。


--------------------------------------------------------------------------------
二、目录结构
--------------------------------------------------------------------------------
solana3/
├── backend/            后端服务 (Feedo Fund Backend Service, 端口 4000)
│   ├── prisma/         Prisma 数据库 schema 与迁移
│   ├── seed/           钱包种子数据
│   └── src/
│       ├── jobs/       定时任务 (scheduler)
│       ├── lib/        公共库 (logger, prisma)
│       ├── scripts/    运维脚本 (airdrop, initTreasury, createToken 等)
│       ├── services/   业务服务 (autoDonation, jupiter, realSwap,
│       │                thresholdSwap, monthlyTransfer, pricing 等)
│       ├── solana/     Solana 客户端与签名器
│       ├── config.ts   环境变量配置
│       └── index.ts    服务入口
├── frontend/           Feedo 前端 (Next.js 14, 端口 3000)
│   └── src/
│       ├── app/        页面 (exchange, pump, swap, simple-test 等)
│       ├── components/ 组件 (WalletConnection, TokenCard, LoadingSpinner)
│       └── hooks/      自定义 Hooks (useWebSocket)
├── pump-frontend/      pump.fun 风格前端 (Next.js 16, 端口 3001/3003)
│   └── src/app/        页面 (主页 /, /create, /trade)
├── shared/             前后端共享代码
├── public/             静态资源 (images / tokens / videos)
├── Dockerfile.prod     生产环境 Docker 镜像 (海外)
├── Dockerfile.prod.cn  生产环境 Docker 镜像 (国内)
├── docker-compose.prod.yml
├── proxy-server.js     代理服务器
├── env.example         环境变量示例
└── package.json       根工作区配置


--------------------------------------------------------------------------------
三、技术栈
--------------------------------------------------------------------------------
后端:
  - Node.js + TypeScript + tsx
  - Express 5 / Express 4 (backend)
  - Prisma ORM + SQLite (dev.db)
  - @solana/web3.js, @solana/spl-token
  - Helius SDK (Webhook / 增强 RPC)
  - Jupiter Aggregator API (代币兑换)
  - Metaplex Token Metadata
  - node-cron (定时任务)
  - ws (WebSocket)
  - pino / winston (日志)
  - zod (数据校验)

前端 (frontend):
  - Next.js 14 + React 18
  - Tailwind CSS
  - TypeScript

前端 (pump-frontend):
  - Next.js 16 + React 19
  - Tailwind CSS 4
  - TypeScript


--------------------------------------------------------------------------------
四、环境要求
--------------------------------------------------------------------------------
- Node.js >= 18 (建议 20+)
- npm >= 9
- (可选) Docker 与 Docker Compose 用于容器化部署


--------------------------------------------------------------------------------
五、快速开始
--------------------------------------------------------------------------------
1. 克隆项目并安装依赖 (每个子项目需单独安装):

    cd backend        && npm install
    cd ../frontend    && npm install
    cd ../pump-frontend && npm install
    cd ../shared      && npm install

2. 配置环境变量:

    复制 env.example 为 .env，并填写:
    - RPC_URL                  Solana RPC 地址
    - HELIUS_API_KEY           Helius API Key
    - JUPITER_BASE             Jupiter API 地址
    - DATABASE_URL             Prisma 数据库地址
    - TREASURY_WALLET          国库钱包地址
    - TARGET_WALLET            目标钱包地址
    - DONATION_WALLET          捐赠钱包地址
    - TREASURY_PRIVATE_KEY     国库私钥 (开发环境)
    - TARGET_PRIVATE_KEY       目标私钥 (开发环境)
    - DONATION_PRIVATE_KEY     捐赠私钥 (开发环境)
    - PORT                     后端端口 (默认 4000)
    - DEMO_MODE                演示模式 (true/false)

3. 初始化数据库:

    cd backend
    npx prisma migrate deploy   # 应用迁移
    npx prisma generate         # 生成客户端
    npm run seed                # 可选: 写入种子钱包数据

4. 启动开发服务:

    后端:    cd backend && npm run dev          (端口 4000)
    前端:    cd frontend && npm run dev          (端口 3000)
    Pump:    cd pump-frontend && npm run dev    (端口 3001)


--------------------------------------------------------------------------------
六、常用脚本
--------------------------------------------------------------------------------
根目录 (package.json):
    npm run build           构建后端 + 前端 + pump-frontend
    npm run build:backend   仅构建后端
    npm run build:frontend  仅构建 frontend
    npm run build:pump      仅构建 pump-frontend
    npm run build:all       构建 frontend + backend + proxy
    npm run proxy           启动代理服务器

后端 (backend/package.json) 常用脚本:
    npm run dev             开发模式启动
    npm run start           生产模式启动 (需先 build)
    npm run build           TypeScript 编译
    npm run create-token    创建代币
    npm run init-treasury   初始化国库
    npm run setup-treasury  配置国库
    npm run test-treasury-swap      测试国库兑换
    npm run verify-exchange-rate    校验兑换汇率
    npm run validate-wallet-config  校验钱包配置
    npm run diagnose-wallet-config  诊断钱包配置
    npm run check-keypair-match     校验密钥对一致性
    npm run fix-keypair-mismatch    修复密钥对不一致
    npm run fix-env-file             修复 .env 文件
    npm run generate-treasury-keypair  生成国库密钥对

前端 (frontend / pump-frontend):
    npm run dev             开发模式
    npm run build           构建
    npm run start           生产启动
    npm run lint            代码检查


--------------------------------------------------------------------------------
七、Docker 部署
--------------------------------------------------------------------------------
1. 海外环境:
    docker build -f Dockerfile.prod -t solana3:prod .
    docker compose -f docker-compose.prod.yml up -d

2. 国内环境:
    docker build -f Dockerfile.prod.cn -t solana3:prod-cn .
    docker compose -f docker-compose.prod.yml up -d

也可使用提供的批处理脚本:
    build-prod.bat          海外构建
    build-prod-cn.bat       国内构建
    build-no-docker.bat     不使用 Docker 构建
    build-simple.bat        简化构建
    start-dev.bat           启动开发
    start-docker.bat        启动 Docker


--------------------------------------------------------------------------------
八、访问地址
--------------------------------------------------------------------------------
- 后端 API:        http://localhost:4000
- Frontend 前端:   http://localhost:3000
- Pump 前端:       http://localhost:3001 (或 3003)

前端主要页面:
    /                主页
    /swap            代币兑换
    /exchange        汇率查询
    /pump            Pump 主页
    /pump/create     创建代币
    /pump/trade      代币交易
    /simple-test     简单测试
    /test-assets     资产测试


--------------------------------------------------------------------------------
九、安全说明
--------------------------------------------------------------------------------
- 私钥仅用于开发环境，生产环境请使用 HSM 或密钥管理服务
    (HSM_ENDPOINT / HSM_API_KEY)
- 切勿将 .env 文件提交到版本控制
- 生产环境建议开启 HTTPS 与反向代理
- 演示模式 (DEMO_MODE=true) 不会执行真实链上交易


--------------------------------------------------------------------------------
十、相关文档
--------------------------------------------------------------------------------
- README.md                 pump-frontend 前端说明
- PROJECT_SUMMARY.md        项目总结
- UPDATED_PROJECT_SUMMARY.md 更新后的项目总结
- BACKEND_README.md         后端说明
- PUMP_FUN_README.md        pump.fun 前端说明
- EXCHANGE_README.md        兑换功能说明
- TREASURY_SWAP_README.md   国库兑换说明
- WALLET_CONFIG_README.md   钱包配置说明
- PRODUCTION_DEPLOY.md      生产部署说明
- DEPLOYMENT_COMPLETE.md    部署完成记录
- PRODUCTION_SUCCESS.md    生产环境成功记录


--------------------------------------------------------------------------------
十一、注意事项
--------------------------------------------------------------------------------
1. 各子项目 (backend / frontend / pump-frontend / shared) 需要分别执行
   npm install。
2. 后端启动前请确保 Prisma 已执行 migrate 和 generate。
3. 前端默认连接后端 WebSocket 与 REST API，请确认后端已启动。
4. 涉及真实资金操作前，请在 devnet 充分测试。
5. 图片、视频等媒体资源位于 public/ 目录，请按需替换为真实文件。

================================================================================
                              文档结束
================================================================================
