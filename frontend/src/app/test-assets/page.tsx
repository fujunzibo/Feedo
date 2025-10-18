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

export default function TestAssetsPage() {
  const [walletAssets, setWalletAssets] = useState<WalletAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWalletAssets()
  }, [])

  const fetchWalletAssets = async () => {
    try {
      setLoading(true)
      console.log('Fetching wallet assets...')
      const response = await fetch('http://localhost:3001/api/wallet-assets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors'
      })
      
      console.log('Response status:', response.status)
      console.log('Response ok:', response.ok)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('API result:', result)
      
      if (result.success) {
        setWalletAssets(result.wallets)
        console.log('Wallet assets set:', result.wallets)
      } else {
        setError(result.error || 'Unknown API error')
      }
    } catch (err) {
      console.error('Error fetching wallet assets:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading wallet assets...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-xl">Error: {error}</div>
        <button 
          onClick={fetchWalletAssets}
          className="ml-4 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Wallet Assets Test</h1>
        
        <button
          onClick={fetchWalletAssets}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded mb-6"
        >
          Refresh Assets
        </button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {walletAssets.map((wallet) => (
            <div key={wallet.id} className="border rounded-lg p-4 bg-white shadow-md">
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
                  <span className="font-medium">
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
                  <span className="font-medium">
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

        {walletAssets.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            No wallet assets found
          </div>
        )}
      </div>
    </div>
  )
}
