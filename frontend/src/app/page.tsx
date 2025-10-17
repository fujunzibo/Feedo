'use client'

import { useState, useEffect } from 'react'

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
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const response = await fetch('http://localhost:4000/api/dashboard')
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const triggerFullWorkflow = async () => {
    try {
      setLoading(true)
      const response = await fetch('http://localhost:4000/api/debug/trigger-full-workflow', {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Feedo Fund Dashboard</h1>
        
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

        {/* Wallets */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Wallets</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data?.wallets.map((wallet) => (
              <div key={wallet.id} className="border rounded p-4">
                <h3 className="font-medium capitalize">{wallet.type}</h3>
                <p className="text-sm text-gray-600 break-all">{wallet.address}</p>
              </div>
            ))}
          </div>
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
          <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
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
        </div>
      </div>
    </div>
  )
}

