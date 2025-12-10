# Vercel 部署指南

## 框架选择

### ✅ 推荐方案：Next.js 全栈
- **前端**: Next.js 14 (App Router) - Vercel 原生支持
- **后端**: Next.js API Routes - 与前端同项目，部署简单
- **数据库**: Vercel Postgres (推荐) 或 外部数据库
- **定时任务**: Vercel Cron Jobs

## 迁移步骤

### 1. 数据库迁移

#### 选项 A: Vercel Postgres (推荐)
```bash
# 在 Vercel Dashboard 创建 Postgres 数据库
# 然后更新 DATABASE_URL
```

#### 选项 B: 外部数据库 (PlanetScale, Supabase, Neon)
```bash
# 使用外部数据库 URL
DATABASE_URL="postgresql://..."
```

### 2. 环境变量配置

在 Vercel Dashboard 设置以下环境变量：

**必需:**
- `DATABASE_URL` - 数据库连接字符串
- `RPC_URL` - Solana RPC 端点
- `MINT_ADDRESS` - FEEDO 代币地址
- `SIGNER_PRIVATE_KEY` - 签名者私钥 (base58 或 hex)

**可选:**
- `TREASURY_WALLET` - 金库钱包地址
- `TARGET_WALLET` - 目标钱包地址
- `DONATION_WALLET` - 捐赠钱包地址
- `HELIUS_API_KEY` - Helius API 密钥
- `JUPITER_BASE` - Jupiter API 基础 URL

### 3. 项目结构

```
frontend/
├── src/
│   ├── app/
│   │   ├── api/              # Next.js API Routes
│   │   │   ├── health/
│   │   │   ├── wallet-assets/
│   │   │   ├── dashboard/
│   │   │   ├── swap/
│   │   │   └── cron/         # Vercel Cron Jobs
│   │   └── ...               # 前端页面
│   ├── lib/                  # 共享库
│   │   ├── prisma.ts
│   │   ├── solana.ts
│   │   └── pricing.ts
│   └── ...
├── prisma/
│   └── schema.prisma
└── package.json
```

### 4. 部署命令

```bash
# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 部署到 Vercel
vercel deploy --prod
```

### 5. Vercel Cron Jobs 配置

已在 `vercel.json` 中配置：
- 月度转账: `0 0 1 * *` → `/api/cron/monthly-transfer`
- 阈值检查: `*/5 * * * *` → `/api/cron/threshold-swap`

## 注意事项

1. **Serverless 限制**:
   - 每个函数最大执行时间: 10秒 (Hobby), 60秒 (Pro)
   - 内存限制: 1024 MB
   - 冷启动可能较慢

2. **数据库连接**:
   - 使用连接池 (Prisma 自动处理)
   - 避免在 Serverless 中保持长连接

3. **定时任务**:
   - Vercel Cron 需要 Pro 计划
   - 或使用外部服务 (如 cron-job.org)

4. **环境变量**:
   - 敏感信息使用 Vercel Secrets
   - 区分开发/预览/生产环境

## 优势

✅ Next.js 原生支持，零配置部署
✅ 前后端同项目，类型共享
✅ 自动 HTTPS、CDN、边缘网络
✅ 按需扩展，无需服务器管理
✅ 内置 CI/CD

## 限制

⚠️ Serverless 函数执行时间限制
⚠️ 定时任务需要 Pro 计划
⚠️ 数据库需要外部服务或 Vercel Postgres

