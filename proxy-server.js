const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// 启用CORS - 简化配置，允许所有本地开发请求
app.use(cors({
  origin: true, // 允许所有来源
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
}));

// 添加预检请求处理
app.options('*', cors());

// 添加请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.get('Origin')}`);
  next();
});

// 代理到后端API
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:4000',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api'
  },
  onError: (err, req, res) => {
    console.error('代理错误:', err);
    res.status(500).json({ error: '代理服务器错误' });
  }
}));

// CoinGecko API代理
app.use('/api/coingecko', createProxyMiddleware({
  target: 'https://api.coingecko.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/coingecko': '/api/v3'
  }
}));

// CoinCap API代理
app.use('/api/coincap', createProxyMiddleware({
  target: 'https://api.coincap.io',
  changeOrigin: true,
  pathRewrite: {
    '^/api/coincap': '/v2'
  }
}));

// CryptoCompare API代理
app.use('/api/cryptocompare', createProxyMiddleware({
  target: 'https://min-api.cryptocompare.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/cryptocompare': '/data'
  }
}));

// Jupiter API代理
app.use('/api/jupiter', createProxyMiddleware({
  target: 'https://quote-api.jup.ag',
  changeOrigin: true,
  pathRewrite: {
    '^/api/jupiter': ''
  }
}));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: '代理服务器运行正常'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`[2] Available endpoints:`);
  console.log(`[2] - http://localhost:${PORT}/api/coingecko/simple/price?ids=bitcoin&vs_currencies=usd`);
  console.log(`[2] - http://localhost:${PORT}/api/coincap/assets/bitcoin`);
  console.log(`[2] - http://localhost:${PORT}/api/cryptocompare/data/price?fsym=BTC&tsyms=USD`);
  console.log(`[2] - http://localhost:${PORT}/api/jupiter/v6/quote`);
  console.log(`[2] - http://localhost:${PORT}/api/dashboard`);
  console.log(`[2] - http://localhost:${PORT}/api/exchange/quote`);
  console.log(`[2] - http://localhost:${PORT}/api/exchange/price`);
  console.log(`[2] - http://localhost:${PORT}/api/exchange/tokens`);
  console.log(`[2] - http://localhost:${PORT}/api/exchange/swap`);
});
