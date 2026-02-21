import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from '../contracts/config'

const Web3Context = createContext(null)

// [Audit fix: I-9] Throttle helper — ignores calls within the cooldown window
function useThrottle(fn, delayMs) {
  const lastCall = useRef(0)
  return useCallback((...args) => {
    const now = Date.now()
    if (now - lastCall.current < delayMs) return
    lastCall.current = now
    return fn(...args)
  }, [fn, delayMs])
}

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

  const connectInner = useCallback(async () => {
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

  // [Audit fix: I-9] Throttle connect to prevent rapid-fire RPC calls
  const connect = useThrottle(connectInner, 500)

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

    // [Audit fix: I-9] Throttle wallet event handlers to prevent rapid RPC bursts
    let lastAccountChange = 0
    const handleAccountsChanged = (accounts) => {
      const now = Date.now()
      if (now - lastAccountChange < 500) return
      lastAccountChange = now
      if (accounts.length === 0) {
        disconnect()
      } else if (accounts[0] !== account) {
        setAccount(accounts[0])
        toast.success('Account changed')
      }
    }

    let lastChainChange = 0
    const handleChainChanged = (chainIdHex) => {
      const now = Date.now()
      if (now - lastChainChange < 500) return
      lastChainChange = now
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
