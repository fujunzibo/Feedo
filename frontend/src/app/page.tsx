'use client'

import { useState, useEffect } from 'react'

interface WalletAsset {
  id: string
  name: string
  type: string
  address: string
  solBalance: number
  solBalanceUsd: number
  tokenBalance: number
  tokenBalanceUsd: number
  totalUsd: number
  error?: string
}

interface DashboardData {
  wallets: Array<{
    id: string
    type: string
    address: string
  }>
  txRecords: Array<{
    id: string
    kind: string
    txSig: string
    status: string
    amountUi: number
    fromAddress: string
    toAddress: string
    createdAt: string
  }>
  metrics: {
    id: string
    cumulativeDonations: number
    lastDonationTimestamp: string | null
    lastSwapTimestamp: string | null
  } | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [walletAssets, setWalletAssets] = useState<WalletAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [walletAssetsLoading, setWalletAssetsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [recordsPerPage, setRecordsPerPage] = useState(500)

  useEffect(() => {
    fetchDashboardData()
  }, [currentPage, recordsPerPage])

  // 只在组件首次挂载时获取钱包资产，避免重复请求
  useEffect(() => {
    // 立即开始获取钱包资产，不等待其他数据
    fetchWalletAssets()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`http://localhost:3001/api/dashboard?page=${currentPage}&limit=${recordsPerPage}`)
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      const result = await response.json()
      
      // 如果后端没有返回分页信息，添加默认值
      if (!result.pagination) {
        result.pagination = {
          page: currentPage,
          limit: recordsPerPage,
          total: result.txRecords?.length || 0,
          totalPages: 1
        }
      }
      
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchWalletAssets = async () => {
    try {
      setWalletAssetsLoading(true)
      console.log('Fetching wallet assets...')
      const response = await fetch('http://localhost:3001/api/wallet-assets')
      console.log('Response status:', response.status)
      if (!response.ok) {
        throw new Error('Failed to fetch wallet assets')
      }
      const result = await response.json()
      console.log('Wallet assets result:', result)
      
      if (result.success) {
        setWalletAssets(result.wallets)
        console.log('Wallet assets set:', result.wallets)
      } else {
        console.error('Failed to fetch wallet assets:', result.error)
      }
    } catch (err) {
      console.error('Error fetching wallet assets:', err)
    } finally {
      setWalletAssetsLoading(false)
    }
  }

  const triggerFullWorkflow = async () => {
    try {
      setLoading(true)
      const response = await fetch('http://localhost:3001/api/debug/trigger-full-workflow', {
        method: 'POST',
      })
      const result = await response.json()
      
      if (result.ok) {
        alert(`Workflow completed successfully!\nTransfer: ${result.transferTx}\nSwap: ${result.swapTx}\nDonation: ${result.donationTx}`)
        fetchDashboardData() // Refresh data
      } else {
        alert(`Workflow failed: ${result.error}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // 只有在没有数据且正在加载时才显示全屏加载
  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-xl">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Feedo Fund Dashboard</h1>
          <a 
            href="/exchange" 
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Token Exchange
          </a>
        </div>
        
        
        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Control Panel</h2>
          <button
            onClick={triggerFullWorkflow}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
          >
            {loading ? 'Running...' : 'Trigger Full Workflow'}
          </button>
        </div>

        {/* Wallet Assets */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Wallet Assets</h2>
            <button
              onClick={fetchWalletAssets}
              disabled={walletAssetsLoading}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm"
            >
              {walletAssetsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {walletAssetsLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="text-lg text-gray-600">Loading wallet assets...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {walletAssets.map((wallet) => (
              <div key={wallet.id} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-lg capitalize text-gray-800">
                    {wallet.name}
                  </h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    wallet.type === 'treasury' ? 'bg-blue-100 text-blue-800' :
                    wallet.type === 'target' ? 'bg-green-100 text-green-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {wallet.type}
                  </span>
                </div>
                
                <div className="space-y-2 mb-3">
                         <div className="flex justify-between">
                           <span className="text-sm text-gray-600">SOL Balance:</span>
                           <span className="font-medium text-gray-800">
                             {wallet.error ? 'Error' : `${wallet.solBalance.toFixed(4)} SOL`}
                           </span>
                         </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">SOL Value:</span>
                    <span className="font-medium text-green-600">
                      {wallet.error ? 'Error' : `$${wallet.solBalanceUsd.toFixed(2)}`}
                    </span>
                  </div>
                         <div className="flex justify-between">
                           <span className="text-sm text-gray-600">FEEDO Balance:</span>
                           <span className="font-medium text-gray-800">
                             {wallet.error ? 'Error' : `${wallet.tokenBalance.toFixed(2)} FEEDO`}
                           </span>
                         </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">FEEDO Value:</span>
                    <span className="font-medium text-green-600">
                      {wallet.error ? 'Error' : `$${wallet.tokenBalanceUsd.toFixed(2)}`}
                    </span>
                  </div>
                </div>
                
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total Value:</span>
                    <span className="text-lg font-bold text-green-600">
                      {wallet.error ? 'Error' : `$${wallet.totalUsd.toFixed(2)}`}
                    </span>
                  </div>
                </div>
                
                <div className="mt-2">
                  <p className="text-xs text-gray-500 break-all">
                    {wallet.address}
                  </p>
                </div>
                
                {wallet.error && (
                  <div className="mt-2 text-xs text-red-600">
                    {wallet.error}
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Metrics */}
        {data?.metrics && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  ${data.metrics.cumulativeDonations.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Total Donated</div>
              </div>
              <div className="text-center">
                <div className="text-lg">
                  {data.metrics.lastDonationTimestamp 
                    ? new Date(data.metrics.lastDonationTimestamp).toLocaleDateString()
                    : 'Never'
                  }
                </div>
                <div className="text-sm text-gray-600">Last Donation</div>
              </div>
              <div className="text-center">
                <div className="text-lg">
                  {data.metrics.lastSwapTimestamp 
                    ? new Date(data.metrics.lastSwapTimestamp).toLocaleDateString()
                    : 'Never'
                  }
                </div>
                <div className="text-sm text-gray-600">Last Swap</div>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Records */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Transaction Records</h2>
            <div className="flex items-center space-x-4">
              <label className="text-sm text-gray-600">
                Records per page:
                <select 
                  value={recordsPerPage} 
                  onChange={(e) => setRecordsPerPage(Number(e.target.value))}
                  className="ml-2 border rounded px-2 py-1"
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                  <option value={2000}>2000</option>
                </select>
              </label>
              <span className="text-sm text-gray-600">
                Showing {data?.txRecords.length || 0} of {data?.pagination?.total || 0} records
              </span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">From</th>
                  <th className="px-4 py-2 text-left">To</th>
                  <th className="px-4 py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {data?.txRecords.map((record) => (
                  <tr key={record.id} className="border-t">
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        record.kind === 'monthly_transfer' ? 'bg-blue-100 text-blue-800' :
                        record.kind === 'swap' ? 'bg-green-100 text-green-800' :
                        record.kind === 'donation' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {record.kind.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        record.status === 'success' ? 'bg-green-100 text-green-800' :
                        record.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{record.amountUi?.toFixed(4) || 'N/A'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {record.fromAddress ? `${record.fromAddress.slice(0, 8)}...${record.fromAddress.slice(-8)}` : 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {record.toAddress ? `${record.toAddress.slice(0, 8)}...${record.toAddress.slice(-8)}` : 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {new Date(record.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-600">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded disabled:bg-gray-100 disabled:text-gray-400"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === data.pagination?.totalPages}
                  className="px-3 py-1 border rounded disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(data.pagination?.totalPages || 1)}
                  disabled={currentPage === data.pagination?.totalPages}
                  className="px-3 py-1 border rounded disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

