'use client';

import { useState, useEffect } from 'react';

interface Token {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

interface Quote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  slippageBps: number;
  routePlan: any[];
  isEstimated?: boolean;
  note?: string;
}

export default function ExchangePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  // 获取代币列表
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/exchange/tokens');
        const data = await response.json();
        if (data.success) {
          setTokens(data.tokens);
          if (data.tokens.length > 0) {
            setFromToken(data.tokens[0]);
            setToToken(data.tokens[1] || data.tokens[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch tokens:', err);
      }
    }
    fetchTokens();
  }, []);

  // 获取代币价格
  useEffect(() => {
    const fetchPrices = async () => {
      if (tokens.length === 0) return;
      
      const pricePromises = tokens.map(async (token) => {
        try {
          const response = await fetch(`http://localhost:3001/api/exchange/price?tokenId=${token.mint}`);
          const data = await response.json();
          return { mint: token.mint, price: data.price || 0 };
        } catch (err) {
          console.error(`Failed to fetch price for ${token.symbol}:`, err);
          return { mint: token.mint, price: 0 };
        }
      });

      const priceResults = await Promise.all(pricePromises);
      const priceMap: Record<string, number> = {};
      priceResults.forEach(({ mint, price }) => {
        priceMap[mint] = price;
      });
      setPrices(priceMap);
    }

    fetchPrices();
  }, [tokens]);

  // 获取报价
  const fetchQuote = async () => {
    if (!fromToken || !toToken || !amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const amountRaw = (parseFloat(amount) * Math.pow(10, fromToken.decimals)).toString();
      
      const response = await fetch(
        `http://localhost:3001/api/exchange/quote?fromToken=${fromToken.mint}&toToken=${toToken.mint}&amount=${amountRaw}`
      );
      
      const data = await response.json();
      
      if (data.success) {
        setQuote(data.quote);
      } else {
        setError(data.error || 'Failed to get quote');
        setQuote(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  // 当参数变化时自动获取报价
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchQuote();
    }, 500); // 防抖

    return () => clearTimeout(timeoutId);
  }, [fromToken, toToken, amount]);

  // 交换代币选择
  const swapTokens = () => {
    if (fromToken && toToken) {
      setFromToken(toToken);
      setToToken(fromToken);
    }
  };

  // 执行兑换
  const executeSwap = async () => {
    if (!fromToken || !toToken || !amount || !quote) return;

    try {
      setLoading(true);
      setError(null);

      const amountRaw = (parseFloat(amount) * Math.pow(10, fromToken.decimals)).toString();
      
      const response = await fetch('http://localhost:3001/api/exchange/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromToken: fromToken.mint,
          toToken: toToken.mint,
          amount: amountRaw,
          slippageBps: 50
        })
      });
      
      const data = await response.json();
      
      if (data.demo) {
        alert('当前为演示模式，未进行真实链上兑换。要开启真实兑换，请在后端关闭 DEMO_MODE 并打通 Jupiter 网络。');
        return;
      }

      if (data.success) {
        alert(`Swap transaction created successfully!\nTransaction: ${String(data.transaction).substring(0, 20)}...`);
      } else {
        setError(data.error || data.message || 'Failed to execute swap');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: string, decimals: number) => {
    const num = parseFloat(amount) / Math.pow(10, decimals);
    return num.toFixed(6);
  };

  const getUsdValue = (amount: string, token: Token) => {
    const price = prices[token.mint] || 0;
    const value = parseFloat(amount) * price;
    return value > 0 ? `$${value.toFixed(2)}` : '';
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">代币兑换</h1>
          
          {/* 兑换表单 */}
          <div className="space-y-4">
            {/* 输入代币 */}
            <div className="border rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">从</label>
              <div className="flex items-center space-x-3">
                <select
                  value={fromToken?.mint || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.mint === e.target.value);
                    setFromToken(token || null);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                >
                  {tokens.map((token) => (
                    <option key={token.mint} value={token.mint}>
                      {token.symbol} - {token.name}
                    </option>
                  ))}
                </select>
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    {fromToken && prices[fromToken.mint] ? `$${prices[fromToken.mint].toFixed(2)}` : ''}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="输入数量"
                  className="w-full border rounded px-3 py-2"
                  step="any"
                />
                {fromToken && amount && (
                  <div className="text-sm text-gray-500 mt-1">
                    {getUsdValue(amount, fromToken)}
                  </div>
                )}
              </div>
            </div>

            {/* 交换按钮 */}
            <div className="flex justify-center">
              <button
                onClick={swapTokens}
                className="bg-gray-200 hover:bg-gray-300 rounded-full p-2"
                disabled={!fromToken || !toToken}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* 输出代币 */}
            <div className="border rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">到</label>
              <div className="flex items-center space-x-3">
                <select
                  value={toToken?.mint || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.mint === e.target.value);
                    setToToken(token || null);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                >
                  {tokens.map((token) => (
                    <option key={token.mint} value={token.mint}>
                      {token.symbol} - {token.name}
                    </option>
                  ))}
                </select>
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    {toToken && prices[toToken.mint] ? `$${prices[toToken.mint].toFixed(2)}` : ''}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <div className="w-full border rounded px-3 py-2 bg-gray-50">
                  {quote ? formatAmount(quote.outputAmount, toToken?.decimals || 9) : '0.000000'}
                </div>
                {toToken && quote && (
                  <div className="text-sm text-gray-500 mt-1">
                    {getUsdValue(quote.outputAmount, toToken)}
                  </div>
                )}
              </div>
            </div>

            {/* 错误信息 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="text-red-800 text-sm">{error}</div>
              </div>
            )}

            {/* 兑换按钮 */}
            <button
              onClick={executeSwap}
              disabled={!quote || loading || !amount || parseFloat(amount) <= 0 || quote?.isEstimated}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium"
            >
              {quote?.isEstimated ? '演示模式（禁用兑换）' : (loading ? '处理中...' : '执行兑换')}
            </button>

            {/* 报价详情 */}
            {quote && (
              <div className="bg-gray-50 rounded p-4">
                <h3 className="font-medium text-gray-900 mb-2">兑换详情</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>滑点: {(quote.slippageBps / 100).toFixed(2)}%</div>
                  <div>路由: {quote.routePlan.length} 步</div>
                  <div>最小输出: {formatAmount(quote.outputAmount, toToken?.decimals || 9)} {toToken?.symbol}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 代币价格表 */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">代币价格</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">代币</th>
                  <th className="text-left py-2">价格 (USD)</th>
                  <th className="text-left py-2">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.mint} className="border-b">
                    <td className="py-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                        <span className="font-medium">{token.symbol}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      {prices[token.mint] ? `$${prices[token.mint].toFixed(4)}` : '加载中...'}
                    </td>
                    <td className="py-2 text-sm text-gray-500">{new Date().toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
