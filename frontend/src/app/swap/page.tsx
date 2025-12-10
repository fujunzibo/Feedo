'use client'

import { useState, useEffect } from 'react'

interface Wallet {
  id: string
  name: string
  type: string
  address: string
}

interface SwapForm {
  fromWalletId: string
  toWalletId: string
  fromToken: 'SOL' | 'FEEDO'
  toToken: 'SOL' | 'FEEDO'
  amount: number
  slippage: number
}

interface SwapResult {
  success: boolean
  transactionSignature?: string
  error?: string
  fromAmount?: number
  toAmount?: number
  priceImpact?: number
}

export default function SwapPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [form, setForm] = useState<SwapForm>({
    fromWalletId: '',
    toWalletId: '',
    fromToken: 'SOL',
    toToken: 'FEEDO',
    amount: 0,
    slippage: 0.5
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SwapResult | null>(null)
  const [rate, setRate] = useState<number>(0)
  const [balances, setBalances] = useState<{[key: string]: {SOL: number, FEEDO: number}}>({})

  useEffect(() => {
    fetchWallets()
    fetchRate()
  }, [])

  useEffect(() => {
    if (form.fromWalletId) {
      fetchWalletBalance(form.fromWalletId)
    }
  }, [form.fromWalletId])

  useEffect(() => {
    if (form.toWalletId) {
      fetchWalletBalance(form.toWalletId)
    }
  }, [form.toWalletId])

  const fetchWallets = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/dashboard')
      const data = await response.json()
      setWallets(data.wallets || [])
    } catch (error) {
      console.error('Failed to fetch wallets:', error)
    }
  }

  const fetchRate = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/swap/rate?fromToken=${form.fromToken}&toToken=${form.toToken}`)
      const data = await response.json()
      if (data.success) {
        setRate(data.rate)
      }
    } catch (error) {
      console.error('Failed to fetch rate:', error)
    }
  }

  const fetchWalletBalance = async (walletId: string) => {
    try {
      const [solResponse, feudoResponse] = await Promise.all([
        fetch(`http://localhost:3001/api/wallet/${walletId}/balance/SOL`),
        fetch(`http://localhost:3001/api/wallet/${walletId}/balance/FEEDO`)
      ])

      const solData = await solResponse.json()
      const feudoData = await feudoResponse.json()

      setBalances(prev => ({
        ...prev,
        [walletId]: {
          SOL: solData.success ? solData.balance : 0,
          FEEDO: feudoData.success ? feudoData.balance : 0
        }
      }))
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error)
    }
  }

  const handleSwap = async () => {
    if (!form.fromWalletId || !form.toWalletId || !form.amount) {
      alert('请填写所有必填字段')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/swap/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()
      setResult(data)

      if (data.success) {
        // 刷新余额
        await fetchWalletBalance(form.fromWalletId)
        await fetchWalletBalance(form.toWalletId)
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTokenSwap = () => {
    setForm(prev => ({
      ...prev,
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      amount: 0
    }))
    fetchRate()
  }

  const calculateOutputAmount = () => {
    if (!form.amount || !rate) return 0
    return form.fromToken === 'SOL' ? form.amount * rate : form.amount * rate
  }

  const getBalance = (walletId: string, token: 'SOL' | 'FEEDO') => {
    return balances[walletId]?.[token] || 0
  }

  const isInsufficientBalance = () => {
    if (!form.fromWalletId || !form.amount) return false
    const balance = getBalance(form.fromWalletId, form.fromToken)
    return balance < form.amount
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">代币兑换</h1>
          <a
            href="/"
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            返回仪表板
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 兑换表单 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-6">兑换设置</h2>

            <div className="space-y-6">
              {/* 源钱包选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  源钱包 *
                </label>
                <select
                  id="fromWalletId"
                  name="fromWalletId"
                  value={form.fromWalletId}
                  onChange={(e) => setForm(prev => ({ ...prev, fromWalletId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择源钱包</option>
                  {wallets.map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} ({wallet.type}) - {wallet.address.slice(0, 8)}...
                    </option>
                  ))}
                </select>
                {form.fromWalletId && (
                  <div className="mt-2 text-sm text-gray-600">
                    余额: {getBalance(form.fromWalletId, form.fromToken).toFixed(4)} {form.fromToken}
                  </div>
                )}
              </div>

              {/* 目标钱包选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  目标钱包 *
                </label>
                <select
                  id="toWalletId"
                  name="toWalletId"
                  value={form.toWalletId}
                  onChange={(e) => setForm(prev => ({ ...prev, toWalletId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择目标钱包</option>
                  {wallets.map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} ({wallet.type}) - {wallet.address.slice(0, 8)}...
                    </option>
                  ))}
                </select>
                {form.toWalletId && (
                  <div className="mt-2 text-sm text-gray-600">
                    余额: {getBalance(form.toWalletId, form.toToken).toFixed(4)} {form.toToken}
                    {form.fromWalletId === form.toWalletId && (
                      <div className="mt-1 text-blue-600 font-medium">
                        💡 内部兑换：将在同一钱包内进行代币转换
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 代币选择 */}
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    从
                  </label>
                  <select
                    id="fromToken"
                    name="fromToken"
                    value={form.fromToken}
                    onChange={(e) => setForm(prev => ({ ...prev, fromToken: e.target.value as 'SOL' | 'FEEDO' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SOL">SOL</option>
                    <option value="FEEDO">FEEDO</option>
                  </select>
                </div>

                <div className="flex flex-col items-center">
                  <button
                    onClick={handleTokenSwap}
                    className="mt-6 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                    type="button"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    到
                  </label>
                  <select
                    id="toToken"
                    name="toToken"
                    value={form.toToken}
                    onChange={(e) => setForm(prev => ({ ...prev, toToken: e.target.value as 'SOL' | 'FEEDO' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SOL">SOL</option>
                    <option value="FEEDO">FEEDO</option>
                  </select>
                </div>
              </div>

              {/* 金额输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  兑换数量 *
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="输入兑换数量"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.0001"
                  min="0"
                />
                {isInsufficientBalance() && (
                  <div className="mt-1 text-sm text-red-600">
                    余额不足
                  </div>
                )}
              </div>

              {/* 滑点设置 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  滑点容忍度 (%)
                </label>
                <input
                  id="slippage"
                  name="slippage"
                  type="number"
                  value={form.slippage}
                  onChange={(e) => setForm(prev => ({ ...prev, slippage: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                  min="0"
                  max="50"
                />
              </div>

              {/* 兑换按钮 */}
              <button
                onClick={handleSwap}
                disabled={loading || isInsufficientBalance() || !form.fromWalletId || !form.toWalletId || !form.amount}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-3 px-4 rounded-lg font-medium transition-colors"
              >
                {loading ? '兑换中...' : '执行兑换'}
              </button>
            </div>
          </div>

          {/* 兑换信息 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-6">兑换信息</h2>

            <div className="space-y-4">
              {form.fromWalletId === form.toWalletId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-blue-800 font-medium">内部兑换模式</span>
                  </div>
                  <p className="text-blue-700 text-sm mt-1">
                    将在同一钱包内进行代币转换，无需跨钱包转账
                  </p>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="text-gray-600">汇率:</span>
                <span className="font-medium">
                  1 {form.fromToken} = {rate} {form.toToken}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">输入数量:</span>
                <span className="font-medium">
                  {form.amount} {form.fromToken}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">预计输出:</span>
                <span className="font-medium text-green-600">
                  {calculateOutputAmount().toFixed(4)} {form.toToken}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">滑点:</span>
                <span className="font-medium">
                  {form.slippage}%
                </span>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-semibold">
                  <span>总计:</span>
                  <span className="text-green-600">
                    {form.amount} {form.fromToken} → {calculateOutputAmount().toFixed(4)} {form.toToken}
                  </span>
                </div>
              </div>
            </div>

            {/* 兑换结果 */}
            {result && (
              <div className={`mt-6 p-4 rounded-lg ${
                result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <h3 className={`font-semibold ${
                  result.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {result.success ? '兑换成功!' : '兑换失败'}
                </h3>
                {result.success ? (
                  <div className="mt-2 text-sm text-green-700">
                    <p>交易签名: {result.transactionSignature}</p>
                    <p>输入: {result.fromAmount} {form.fromToken}</p>
                    <p>输出: {result.toAmount} {form.toToken}</p>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-red-700">
                    <p>错误: {result.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
