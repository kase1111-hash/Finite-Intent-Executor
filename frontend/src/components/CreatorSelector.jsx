import React, { useState } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { User } from 'lucide-react'

/**
 * Chooses which creator an operator page works on. Operators (executors,
 * indexers, sunset operators) act on behalf of a creator, usually not
 * themselves; the connected account is the default.
 */
function CreatorSelector({ account, creator, onChange }) {
  const [input, setInput] = useState('')
  const isSelf = creator?.toLowerCase() === account?.toLowerCase()

  const apply = (e) => {
    e.preventDefault()
    if (!ethers.isAddress(input)) {
      toast.error('Enter a valid creator address')
      return
    }
    onChange(ethers.getAddress(input))
    setInput('')
  }

  return (
    <div className="card p-4 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <User size={18} className="text-gray-500 shrink-0" />
        <span className="text-gray-500 shrink-0">Creator:</span>
        <span className="font-mono truncate" title={creator}>{creator}</span>
        {isSelf && <span className="badge-neutral shrink-0">you</span>}
      </div>
      <form onSubmit={apply} className="flex gap-2 md:ml-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.trim())}
          placeholder="Another creator 0x..."
          aria-label="Creator address"
          className="input font-mono text-sm py-1.5 md:w-80"
        />
        <button type="submit" className="btn-secondary text-sm">View</button>
        {!isSelf && (
          <button type="button" onClick={() => onChange(null)} className="btn-secondary text-sm">
            Me
          </button>
        )}
      </form>
    </div>
  )
}

export default CreatorSelector
