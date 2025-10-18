'use client'

import { useState, useEffect } from 'react'

export default function SimpleTestPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      console.log('Fetching data...')
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
      setData(result)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
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
        <button 
          onClick={fetchData}
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Simple Test Page</h1>
        
        <button
          onClick={fetchData}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded mb-6"
        >
          Refresh Data
        </button>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">API Response:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-sm">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>

        {data && data.wallets && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Wallet Assets:</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {data.wallets.map((wallet: any) => (
                <div key={wallet.id} className="border rounded-lg p-4 bg-white shadow-md">
                  <h3 className="font-semibold text-lg capitalize text-gray-800 mb-2">
                    {wallet.name}
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">SOL Balance:</span>
                      <span className="font-medium">
                        {wallet.solBalance.toFixed(4)} SOL
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">SOL Value:</span>
                      <span className="font-medium text-green-600">
                        ${wallet.solBalanceUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">FEEDO Balance:</span>
                      <span className="font-medium">
                        {wallet.tokenBalance.toFixed(2)} FEEDO
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">FEEDO Value:</span>
                      <span className="font-medium text-green-600">
                        ${wallet.tokenBalanceUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total Value:</span>
                        <span className="text-lg font-bold text-green-600">
                          ${wallet.totalUsd.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
