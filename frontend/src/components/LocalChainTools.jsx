import React, { useState } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Clock, FastForward, Box } from 'lucide-react'
import { useWeb3, LOCAL_ACCOUNTS_ENABLED } from '../context/Web3Context'
import { LOCAL_CHAIN_ID, LOCAL_RPC_URL, NETWORK_CONFIG } from '../contracts/config'
import { getErrorMessage } from '../utils/errors'

const DAY = 24 * 60 * 60

const TIME_STEPS = [
  { label: '+1 day', seconds: DAY },
  { label: '+31 days', seconds: 31 * DAY },
  { label: '+20 years', seconds: 20 * 365 * DAY },
]

/**
 * Development-only controls for a local Hardhat node: advance chain time and
 * mine blocks, so the deadman switch (30+ days) and the sunset (20 years) can
 * be exercised from the dashboard. Rendered only by `npm run dev` on chain
 * 31337; production builds compile it out.
 */
function LocalChainTools() {
  const { chainId, chainNow, refresh } = useWeb3()
  const [busy, setBusy] = useState(false)

  if (!LOCAL_ACCOUNTS_ENABLED || chainId !== LOCAL_CHAIN_ID) return null

  const run = async (description, method, params) => {
    setBusy(true)
    // A dedicated connection: injected wallets do not forward evm_* methods.
    const node = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl || LOCAL_RPC_URL)
    try {
      await node.send(method, params)
      if (method === 'evm_increaseTime') await node.send('evm_mine', [])
      toast.success(description)
      refresh()
    } catch (err) {
      toast.error(`Local chain command failed: ${getErrorMessage(err)}`)
    } finally {
      node.destroy()
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 pb-3 mb-3 border-b border-gray-200" data-testid="local-chain-tools">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Local chain tools</p>
      {chainNow && (
        <p className="flex items-center gap-1 text-xs text-gray-600">
          <Clock size={12} />
          Chain time: {format(new Date(chainNow * 1000), 'PP p')}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {TIME_STEPS.map(({ label, seconds }) => (
          <button
            key={label}
            disabled={busy}
            onClick={() => run(`Advanced chain time ${label.slice(1)}`, 'evm_increaseTime', [seconds])}
            className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
          >
            <FastForward size={12} />
            {label}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => run('Mined 2 blocks', 'hardhat_mine', ['0x2'])}
          className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
          title="Mine blocks, e.g. to pass the deadman switch commit-reveal delay"
        >
          <Box size={12} />
          Mine 2 blocks
        </button>
      </div>
    </div>
  )
}

export default LocalChainTools
