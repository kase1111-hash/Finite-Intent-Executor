import React, { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  Coins,
  Plus,
  FileText,
  Code,
  Music,
  Image,
  RefreshCw,
  Shield,
} from 'lucide-react'

const IP_TYPES = [
  { value: 'article', label: 'Article/Paper', icon: FileText },
  { value: 'code', label: 'Code/Software', icon: Code },
  { value: 'music', label: 'Music/Audio', icon: Music },
  { value: 'art', label: 'Art/Image', icon: Image },
  { value: 'collection', label: 'Collection', icon: Coins },
]

function IPTokens() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tokens, setTokens] = useState([])
  const [showMintForm, setShowMintForm] = useState(false)

  // Mint form state
  const [mintForm, setMintForm] = useState({
    name: '',
    description: '',
    ipType: 'article',
    content: '',
    metadataUri: '',
    license: 'MIT',
  })

  // License form state
  const [licenseForm, setLicenseForm] = useState({
    tokenId: '',
    licensee: '',
    royaltyBps: 500, // 5%
    durationDays: 365,
  })
  const [showLicenseForm, setShowLicenseForm] = useState(false)

  const fetchTokens = useCallback(async () => {
    if (!isConnected || !account || !contracts.IPToken) return

    setLoading(true)
    try {
      // For demo purposes, we'll fetch metadata for tokens we might own
      // In production, you'd use events or an indexer
      const tokenList = []

      // Try to get total supply and check ownership
      try {
        const totalSupply = await contracts.IPToken.totalSupply()

        for (let i = 0; i < Math.min(Number(totalSupply), 100); i++) {
          try {
            const owner = await contracts.IPToken.ownerOf(i)
            if (owner.toLowerCase() === account.toLowerCase()) {
              const metadata = await contracts.IPToken.getIPMetadata(i)
              tokenList.push({
                tokenId: i,
                ...metadata,
              })
            }
          } catch {
            // Skip token if ownership check fails
          }
        }
      } catch {
        // Total supply fetch failed
      }

      setTokens(tokenList)
    } catch (err) {
      console.error('Failed to fetch tokens:', err)
    } finally {
      setLoading(false)
    }
  }, [account, contracts, isConnected])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  const handleMint = async (e) => {
    e.preventDefault()

    if (!mintForm.name.trim() || !mintForm.content.trim()) {
      toast.error('Name and content are required')
      return
    }

    setSubmitting(true)
    try {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(mintForm.content))

      const tx = await contracts.IPToken.mintIP(
        account,
        mintForm.name,
        mintForm.description,
        mintForm.ipType,
        contentHash,
        mintForm.metadataUri || 'ipfs://',
        mintForm.license
      )

      toast.loading('Minting IP token...', { id: 'mint' })
      await tx.wait()
      toast.success('IP token minted successfully!', { id: 'mint' })

      setShowMintForm(false)
      setMintForm({
        name: '',
        description: '',
        ipType: 'article',
        content: '',
        metadataUri: '',
        license: 'MIT',
      })
      fetchTokens()
    } catch (err) {
      console.error('Failed to mint:', err)
      toast.error('Failed to mint IP token. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGrantLicense = async (e) => {
    e.preventDefault()

    if (!ethers.isAddress(licenseForm.licensee)) {
      toast.error('Invalid licensee address')
      return
    }

    setSubmitting(true)
    try {
      const durationSeconds = licenseForm.durationDays * 24 * 60 * 60

      const tx = await contracts.IPToken.grantLicense(
        licenseForm.tokenId,
        licenseForm.licensee,
        licenseForm.royaltyBps,
        durationSeconds
      )

      toast.loading('Granting license...', { id: 'license' })
      await tx.wait()
      toast.success('License granted successfully!', { id: 'license' })

      setShowLicenseForm(false)
      setLicenseForm({
        tokenId: '',
        licensee: '',
        royaltyBps: 500,
        durationDays: 365,
      })
    } catch (err) {
      console.error('Failed to grant license:', err)
      toast.error('Failed to grant license. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const getTypeIcon = (ipType) => {
    const type = IP_TYPES.find(t => t.value === ipType)
    return type ? type.icon : FileText
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <Coins size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Connect your wallet to manage IP tokens</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IP Tokens</h1>
          <p className="text-gray-600 mt-1">Tokenize and manage your intellectual property</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTokens}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowMintForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Mint New Token
          </button>
        </div>
      </div>

      {/* Tokens Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={32} className="animate-spin text-primary-600" />
        </div>
      ) : tokens.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token) => {
            const TypeIcon = getTypeIcon(token.ipType)
            return (
              <div key={token.tokenId} className="card hover:shadow-md transition-shadow">
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div className="p-2 bg-primary-50 rounded-lg">
                      <TypeIcon size={24} className="text-primary-600" />
                    </div>
                    <span className="badge-info">#{token.tokenId}</span>
                  </div>

                  <h3 className="font-semibold text-gray-900 mt-4">{token.name}</h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{token.description}</p>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Type</span>
                      <span className="capitalize">{token.ipType}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">License</span>
                      <span className="font-mono">{token.license}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Status</span>
                      {token.isPublicDomain ? (
                        <span className="badge-success">Public Domain</span>
                      ) : (
                        <span className="badge-info">Active</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={() => {
                        setLicenseForm(prev => ({ ...prev, tokenId: token.tokenId }))
                        setShowLicenseForm(true)
                      }}
                      className="btn-secondary text-sm flex-1"
                    >
                      Grant License
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20 card">
          <Coins size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No IP Tokens Yet</h3>
          <p className="text-gray-600 mb-4">
            Mint your first IP token to start tokenizing your intellectual property
          </p>
          <button
            onClick={() => setShowMintForm(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={18} />
            Mint Your First Token
          </button>
        </div>
      )}

      {/* Mint Modal */}
      {showMintForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Mint IP Token</h2>
              <p className="text-sm text-gray-600 mt-1">Create an ERC721 token for your IP</p>
            </div>

            <form onSubmit={handleMint} className="p-6 space-y-4">
              <div>
                <label className="label">Name *</label>
                <input
                  type="text"
                  value={mintForm.name}
                  onChange={(e) => setMintForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Research Paper"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={mintForm.description}
                  onChange={(e) => setMintForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="A groundbreaking research paper on..."
                  className="input min-h-[80px]"
                />
              </div>

              <div>
                <label className="label">IP Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {IP_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMintForm(prev => ({ ...prev, ipType: value }))}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${
                        mintForm.ipType === value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon size={20} className={`mx-auto ${
                        mintForm.ipType === value ? 'text-primary-600' : 'text-gray-400'
                      }`} />
                      <span className="text-xs mt-1 block">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Content (for hashing) *</label>
                <textarea
                  value={mintForm.content}
                  onChange={(e) => setMintForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Paste your content here for cryptographic hashing..."
                  className="input min-h-[100px] font-mono text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Content will be hashed on-chain. Store the original securely.
                </p>
              </div>

              <div>
                <label className="label">Metadata URI (IPFS)</label>
                <input
                  type="text"
                  value={mintForm.metadataUri}
                  onChange={(e) => setMintForm(prev => ({ ...prev, metadataUri: e.target.value }))}
                  placeholder="ipfs://..."
                  className="input font-mono"
                />
              </div>

              <div>
                <label className="label">License</label>
                <select
                  value={mintForm.license}
                  onChange={(e) => setMintForm(prev => ({ ...prev, license: e.target.value }))}
                  className="input"
                >
                  <option value="CC0">CC0 (Public Domain)</option>
                  <option value="CC-BY">CC-BY (Attribution)</option>
                  <option value="CC-BY-SA">CC-BY-SA (Attribution-ShareAlike)</option>
                  <option value="CC-BY-NC">CC-BY-NC (Attribution-NonCommercial)</option>
                  <option value="MIT">MIT</option>
                  <option value="Apache-2.0">Apache 2.0</option>
                  <option value="GPL-3.0">GPL 3.0</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMintForm(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Minting...
                    </>
                  ) : (
                    <>
                      <Coins size={18} />
                      Mint Token
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* License Modal */}
      {showLicenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Grant License</h2>
              <p className="text-sm text-gray-600 mt-1">
                Grant usage rights for Token #{licenseForm.tokenId}
              </p>
            </div>

            <form onSubmit={handleGrantLicense} className="p-6 space-y-4">
              <div>
                <label className="label">Licensee Address *</label>
                <input
                  type="text"
                  value={licenseForm.licensee}
                  onChange={(e) => setLicenseForm(prev => ({ ...prev, licensee: e.target.value }))}
                  placeholder="0x..."
                  className="input font-mono"
                  required
                />
              </div>

              <div>
                <label className="label">Royalty Rate (%)</label>
                <input
                  type="number"
                  value={licenseForm.royaltyBps / 100}
                  onChange={(e) => setLicenseForm(prev => ({
                    ...prev,
                    royaltyBps: Math.round(parseFloat(e.target.value) * 100)
                  }))}
                  min="0"
                  max="100"
                  step="0.1"
                  className="input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {licenseForm.royaltyBps} basis points
                </p>
              </div>

              <div>
                <label className="label">Duration (days)</label>
                <input
                  type="number"
                  value={licenseForm.durationDays}
                  onChange={(e) => setLicenseForm(prev => ({
                    ...prev,
                    durationDays: parseInt(e.target.value)
                  }))}
                  min="1"
                  max="3650"
                  className="input"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLicenseForm(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Granting...
                    </>
                  ) : (
                    <>
                      <Shield size={18} />
                      Grant License
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default IPTokens
