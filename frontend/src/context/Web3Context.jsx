import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  CONTRACT_ABIS,
  CONTRACT_NAMES,
  getContractAddress,
  NETWORK_CONFIG,
  LOCAL_CHAIN_ID,
  LOCAL_RPC_URL,
} from '../contracts/config'
import { getErrorMessage } from '../utils/errors'

const Web3Context = createContext(null)

// The local development account (a Hardhat node's unlocked accounts) is only
// offered by the Vite dev server. Production builds compile this out.
export const LOCAL_ACCOUNTS_ENABLED = import.meta.env.DEV

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

/**
 * Builds contract instances for every configured address and reports which
 * contracts are unusable: no address configured, or no code at the address
 * on the connected chain (wrong network, or a restarted local node).
 */
async function initializeContracts(signerInstance, provider) {
  const contracts = {}
  const unavailable = []

  await Promise.all(CONTRACT_NAMES.map(async (name) => {
    const address = getContractAddress(name)
    if (!address) {
      unavailable.push({ name, reason: 'no address configured' })
      return
    }
    try {
      const code = await provider.getCode(address)
      if (code === '0x') {
        unavailable.push({ name, reason: `no contract at ${address} on this network` })
        return
      }
      contracts[name] = new ethers.Contract(address, CONTRACT_ABIS[name], signerInstance)
    } catch (err) {
      console.warn(`Failed to initialize ${name} contract:`, err)
      unavailable.push({ name, reason: getErrorMessage(err) })
    }
  }))

  return { contracts, unavailable }
}

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [contracts, setContracts] = useState({})
  const [unavailableContracts, setUnavailableContracts] = useState([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  // 'injected' (MetaMask etc.) or 'local' (dev-only Hardhat node account)
  const [walletType, setWalletType] = useState(null)
  const [localAccounts, setLocalAccounts] = useState([])
  // Bumped after anything that changes chain state outside a page's own
  // actions (e.g. the local dev time controls); pages refetch when it changes.
  const [refreshKey, setRefreshKey] = useState(0)
  // Latest block timestamp in seconds. Countdowns use chain time, which on a
  // local node can run ahead of the wall clock after time travel.
  const [chainNow, setChainNow] = useState(null)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    if (!provider) {
      setChainNow(null)
      return
    }
    let cancelled = false
    provider.getBlock('latest')
      .then((block) => { if (!cancelled && block) setChainNow(block.timestamp) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [provider, refreshKey])

  const applyConnection = useCallback(async (providerInstance, signerInstance, type) => {
    const address = await signerInstance.getAddress()
    const network = await providerInstance.getNetwork()
    const { contracts: contractInstances, unavailable } =
      await initializeContracts(signerInstance, providerInstance)

    setProvider(providerInstance)
    setSigner(signerInstance)
    setAccount(address)
    setChainId(Number(network.chainId))
    setContracts(contractInstances)
    setUnavailableContracts(unavailable)
    setWalletType(type)
    setIsConnected(true)
  }, [])

  const connectLocalInner = useCallback(async (accountIndex = 0) => {
    if (!LOCAL_ACCOUNTS_ENABLED) return false

    setIsConnecting(true)
    try {
      const rpcUrl = NETWORK_CONFIG.rpcUrl || LOCAL_RPC_URL
      // No request cache: local time travel and mining change "latest"
      // between requests that ethers would otherwise coalesce for 250ms.
      const localProvider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        pollingInterval: 500,
        cacheTimeout: -1,
      })
      const network = await localProvider.getNetwork()
      if (Number(network.chainId) !== LOCAL_CHAIN_ID) {
        localProvider.destroy()
        toast.error(`The node at ${rpcUrl} is not a local Hardhat chain (chain ID ${network.chainId}).`)
        return false
      }

      const accounts = await localProvider.listAccounts()
      setLocalAccounts(accounts.map((a) => a.address))
      await applyConnection(localProvider, await localProvider.getSigner(accountIndex), 'local')
      toast.success(`Connected local account #${accountIndex}`)
      return true
    } catch (err) {
      console.error('Local connection error:', err)
      toast.error('Could not reach a local Hardhat node. Start one with `npm run node` in the repository root.')
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [applyConnection])

  const connectInner = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      if (LOCAL_ACCOUNTS_ENABLED) {
        return connectLocalInner(0)
      }
      toast.error('Please install MetaMask to use this application')
      return false
    }

    setIsConnecting(true)

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum)
      await browserProvider.send('eth_requestAccounts', [])
      await applyConnection(browserProvider, await browserProvider.getSigner(), 'injected')
      toast.success('Wallet connected successfully')
      return true
    } catch (err) {
      console.error('Connection error:', err)
      toast.error(`Failed to connect wallet: ${getErrorMessage(err)}`)
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [applyConnection, connectLocalInner])

  // [Audit fix: I-9] Throttle connect to prevent rapid-fire RPC calls
  const connect = useThrottle(connectInner, 500)
  const connectLocal = useThrottle(connectLocalInner, 500)

  const disconnect = useCallback(() => {
    if (walletType === 'local') provider?.destroy()
    setProvider(null)
    setSigner(null)
    setAccount(null)
    setChainId(null)
    setContracts({})
    setUnavailableContracts([])
    setWalletType(null)
    setIsConnected(false)
    toast.success('Wallet disconnected')
  }, [provider, walletType])

  /** Switches the local dev account (local wallet only). */
  const switchLocalAccount = useCallback(async (accountIndex) => {
    if (walletType !== 'local' || !provider) return
    try {
      await applyConnection(provider, await provider.getSigner(accountIndex), 'local')
      toast.success(`Switched to local account #${accountIndex}`)
    } catch (err) {
      toast.error(`Failed to switch account: ${getErrorMessage(err)}`)
    }
  }, [applyConnection, provider, walletType])

  useEffect(() => {
    if (typeof window.ethereum === 'undefined' || walletType !== 'injected') return

    // [Audit fix: I-9] Throttle wallet event handlers to prevent rapid RPC bursts
    let lastAccountChange = 0
    const handleAccountsChanged = async (accounts) => {
      const now = Date.now()
      if (now - lastAccountChange < 500) return
      lastAccountChange = now
      if (accounts.length === 0) {
        disconnect()
      } else if (accounts[0].toLowerCase() !== account?.toLowerCase()) {
        // Rebind the signer and contracts: transactions must come from the new
        // account, not just the displayed address.
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum)
          await applyConnection(browserProvider, await browserProvider.getSigner(), 'injected')
          toast.success('Account changed')
        } catch (err) {
          toast.error(`Failed to switch account: ${getErrorMessage(err)}`)
        }
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
  }, [account, applyConnection, disconnect, walletType])

  const expectedChainId = NETWORK_CONFIG.chainId
  const isWrongNetwork = isConnected && expectedChainId !== null && chainId !== expectedChainId

  const value = {
    provider,
    signer,
    account,
    chainId,
    contracts,
    unavailableContracts,
    isConnecting,
    isConnected,
    isWrongNetwork,
    expectedChainId,
    walletType,
    localAccounts,
    refreshKey,
    refresh,
    chainNow,
    connect,
    connectLocal,
    switchLocalAccount,
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
