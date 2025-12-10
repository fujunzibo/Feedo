# Vercel 迁移总结

## ✅ 已完成的配置

### 1. 框架选择
- **前端**: Next.js 14 (App Router) - ✅ 已有
- **后端**: Next.js API Routes - ✅ 已创建示例
- **数据库**: Prisma + PostgreSQL (需要迁移)
- **定时任务**: Vercel Cron Jobs

### 2. 已创建的文件

#### 配置文件
- ✅ `vercel.json` - Vercel 部署配置
- ✅ `frontend/tsconfig.json` - TypeScript 配置（添加路径别名）
- ✅ `frontend/package.json` - 添加 Prisma 依赖

#### API Routes (Next.js)
- ✅ `frontend/src/app/api/health/route.ts` - 健康检查
- ✅ `frontend/src/app/api/wallet-assets/route.ts` - 钱包资产
- ✅ `frontend/src/app/api/dashboard/route.ts` - 仪表板数据

#### 共享库
- ✅ `frontend/src/lib/prisma.ts` - Prisma 客户端（Serverless 优化）
- ✅ `frontend/src/lib/solana.ts` - Solana 连接
- ✅ `frontend/src/lib/pricing.ts` - 价格获取

#### 数据库
- ✅ `frontend/prisma/schema.prisma` - Prisma Schema (PostgreSQL)

## 📋 待完成的任务

### 1. 迁移剩余的 API Routes
需要将以下 Express 路由迁移到 Next.js API Routes：

- [ ] `/api/export-csv` → `frontend/src/app/api/export-csv/route.ts`
- [ ] `/api/exchange/swap` → `frontend/src/app/api/exchange/swap/route.ts`
- [ ] `/api/swap/execute` → `frontend/src/app/api/swap/execute/route.ts`
- [ ] `/api/swap/rate` → `frontend/src/app/api/swap/rate/route.ts`
- [ ] `/api/wallet/:walletId/balance/:token` → `frontend/src/app/api/wallet/[walletId]/balance/[token]/route.ts`
- [ ] `/api/debug/*` → `frontend/src/app/api/debug/*/route.ts`

### 2. 迁移服务层代码
需要将 `backend/src/services/` 中的代码迁移到 `frontend/src/lib/`：

- [ ] `monthlyTransfer.ts` → `frontend/src/lib/monthlyTransfer.ts`
- [ ] `thresholdSwap.ts` → `frontend/src/lib/thresholdSwap.ts`
- [ ] `autoDonation.ts` → `frontend/src/lib/autoDonation.ts`
- [ ] `realSwap.ts` → `frontend/src/lib/realSwap.ts`
- [ ] `jupiter.ts` → `frontend/src/lib/jupiter.ts`

### 3. 创建 Cron Jobs
- [ ] `frontend/src/app/api/cron/monthly-transfer/route.ts`
- [ ] `frontend/src/app/api/cron/threshold-swap/route.ts`

### 4. 数据库迁移
- [ ] 在 Vercel Dashboard 创建 Postgres 数据库
- [ ] 更新 `DATABASE_URL` 环境变量
- [ ] 运行迁移: `npx prisma migrate deploy`

### 5. 环境变量配置
在 Vercel Dashboard 设置以下环境变量：

**必需:**
- `DATABASE_URL` - PostgreSQL 连接字符串
- `RPC_URL` - Solana RPC 端点
- `MINT_ADDRESS` - FEEDO 代币地址
- `SIGNER_PRIVATE_KEY` - 签名者私钥

**可选:**
- `TREASURY_WALLET`
- `TARGET_WALLET`
- `DONATION_WALLET`
- `HELIUS_API_KEY`
- `JUPITER_BASE`

## 🚀 部署步骤

### 1. 安装 Vercel CLI
```bash
npm i -g vercel
```

### 2. 登录 Vercel
```bash
vercel login
```

### 3. 初始化项目
```bash
cd frontend
vercel
```

### 4. 配置环境变量
在 Vercel Dashboard → Project → Settings → Environment Variables 中添加所有必需的环境变量

### 5. 运行数据库迁移
```bash
# 在 Vercel Dashboard 的 Functions 标签页运行
# 或使用 Vercel CLI
vercel env pull .env.local
npx prisma migrate deploy
```

### 6. 部署
```bash
vercel --prod
```

## ⚠️ 注意事项

### Serverless 限制
- 函数最大执行时间: 10秒 (Hobby), 60秒 (Pro)
- 内存限制: 1024 MB
- 冷启动可能较慢

### 数据库
- 使用连接池（Prisma 自动处理）
- 避免在 Serverless 中保持长连接
- 考虑使用 Vercel Postgres 或外部数据库服务

### 定时任务
- Vercel Cron 需要 **Pro 计划** ($20/月)
- 或使用外部服务（如 cron-job.org）调用 API endpoints

### 成本
- Hobby: 免费（有限制）
- Pro: $20/月（包含 Cron Jobs）
- 数据库: Vercel Postgres 或外部服务

## 📚 参考文档

- [Vercel Next.js 文档](https://vercel.com/docs/frameworks/nextjs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Prisma + Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)

