import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from '../contracts/config'

const Web3Context = createContext(null)

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [contracts, setContracts] = useState({})
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  const initializeContracts = useCallback(async (signerInstance) => {
    if (!signerInstance) return {}

    const contractInstances = {}

    for (const [name, address] of Object.entries(CONTRACT_ADDRESSES)) {
      if (CONTRACT_ABIS[name] && address) {
        try {
          contractInstances[name] = new ethers.Contract(address, CONTRACT_ABIS[name], signerInstance)
        } catch (err) {
          console.warn(`Failed to initialize ${name} contract:`, err)
        }
      }
    }

    return contractInstances
  }, [])

  const connect = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      toast.error('Please install MetaMask to use this application')
      return false
    }

    setIsConnecting(true)

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await browserProvider.send('eth_requestAccounts', [])
      const signerInstance = await browserProvider.getSigner()
      const network = await browserProvider.getNetwork()

      setProvider(browserProvider)
      setSigner(signerInstance)
      setAccount(accounts[0])
      setChainId(Number(network.chainId))
      setIsConnected(true)

      const contractInstances = await initializeContracts(signerInstance)
      setContracts(contractInstances)

      toast.success('Wallet connected successfully')
      return true
    } catch (err) {
      console.error('Connection error:', err)
      toast.error('Failed to connect wallet')
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [initializeContracts])

  const disconnect = useCallback(() => {
    setProvider(null)
    setSigner(null)
    setAccount(null)
    setChainId(null)
    setContracts({})
    setIsConnected(false)
    toast.success('Wallet disconnected')
  }, [])

  useEffect(() => {
    if (typeof window.ethereum === 'undefined') return

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect()
      } else if (accounts[0] !== account) {
        setAccount(accounts[0])
        toast.success('Account changed')
      }
    }

    const handleChainChanged = (chainIdHex) => {
      const newChainId = parseInt(chainIdHex, 16)
      setChainId(newChainId)
      toast.success('Network changed')
      window.location.reload()
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [account, disconnect])

  const value = {
    provider,
    signer,
    account,
    chainId,
    contracts,
    isConnecting,
    isConnected,
    connect,
    disconnect,
  }

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>
}

export function useWeb3() {
  const context = useContext(Web3Context)
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider')
  }
  return context
}
