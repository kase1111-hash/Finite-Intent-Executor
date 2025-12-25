import React, { useState, useEffect } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  BookOpen,
  Search,
  Plus,
  Lock,
  Unlock,
  RefreshCw,
  Tag,
  FileText,
  Hash,
  Calendar,
} from 'lucide-react'
import { format } from 'date-fns'

function Lexicon() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [corpus, setCorpus] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  // Freeze corpus form
  const [freezeForm, setFreezeForm] = useState({
    corpusContent: '',
    storageUri: '',
    startYear: new Date().getFullYear() - 5,
    endYear: new Date().getFullYear() + 3,
  })

  // Semantic index form
  const [indexForm, setIndexForm] = useState({
    keyword: '',
    citations: [''],
    relevanceScores: [90],
  })

  const fetchCorpusData = async () => {
    if (!isConnected || !account || !contracts.LexiconHolder) return

    setLoading(true)
    try {
      const corpusData = await contracts.LexiconHolder.getCorpus(account)
      const hasCorpus = corpusData.corpusHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'

      if (hasCorpus) {
        setCorpus(corpusData)
      }
    } catch (err) {
      console.error('Failed to fetch corpus:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCorpusData()
  }, [account, contracts, isConnected])

  const handleFreezeCorpus = async (e) => {
    e.preventDefault()

    if (!freezeForm.corpusContent.trim() || !freezeForm.storageUri.trim()) {
      toast.error('Corpus content and storage URI are required')
      return
    }

    const yearDiff = freezeForm.endYear - freezeForm.startYear
    if (yearDiff < 5 || yearDiff > 10) {
      toast.error('Corpus window must be 5-10 years')
      return
    }

    setSubmitting(true)
    try {
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes(freezeForm.corpusContent))

      const tx = await contracts.LexiconHolder.freezeCorpus(
        account,
        corpusHash,
        freezeForm.storageUri,
        freezeForm.startYear,
        freezeForm.endYear
      )

      toast.loading('Freezing corpus...', { id: 'freeze' })
      await tx.wait()
      toast.success('Corpus frozen successfully!', { id: 'freeze' })
      fetchCorpusData()
    } catch (err) {
      console.error('Failed to freeze corpus:', err)
      toast.error(err.reason || 'Failed to freeze corpus')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateIndex = async (e) => {
    e.preventDefault()

    if (!indexForm.keyword.trim()) {
      toast.error('Keyword is required')
      return
    }

    const validCitations = indexForm.citations.filter(c => c.trim())
    if (validCitations.length === 0) {
      toast.error('At least one citation is required')
      return
    }

    setSubmitting(true)
    try {
      const scores = indexForm.relevanceScores.slice(0, validCitations.length)

      const tx = await contracts.LexiconHolder.createSemanticIndex(
        account,
        indexForm.keyword,
        validCitations,
        scores
      )

      toast.loading('Creating semantic index...', { id: 'index' })
      await tx.wait()
      toast.success('Semantic index created!', { id: 'index' })

      setIndexForm({
        keyword: '',
        citations: [''],
        relevanceScores: [90],
      })
    } catch (err) {
      console.error('Failed to create index:', err)
      toast.error(err.reason || 'Failed to create semantic index')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Enter a search query')
      return
    }

    setSubmitting(true)
    try {
      const result = await contracts.LexiconHolder.resolveAmbiguity(account, searchQuery)
      setSearchResults({
        citations: result.citations || result[0],
        scores: result.scores || result[1],
      })
    } catch (err) {
      console.error('Search failed:', err)
      toast.error(err.reason || 'Search failed')
      setSearchResults(null)
    } finally {
      setSubmitting(false)
    }
  }

  const addCitation = () => {
    setIndexForm(prev => ({
      ...prev,
      citations: [...prev.citations, ''],
      relevanceScores: [...prev.relevanceScores, 90],
    }))
  }

  const removeCitation = (index) => {
    if (indexForm.citations.length > 1) {
      setIndexForm(prev => ({
        ...prev,
        citations: prev.citations.filter((_, i) => i !== index),
        relevanceScores: prev.relevanceScores.filter((_, i) => i !== index),
      }))
    }
  }

  const updateCitation = (index, value) => {
    const newCitations = [...indexForm.citations]
    newCitations[index] = value
    setIndexForm(prev => ({ ...prev, citations: newCitations }))
  }

  const updateScore = (index, value) => {
    const newScores = [...indexForm.relevanceScores]
    newScores[index] = parseInt(value)
    setIndexForm(prev => ({ ...prev, relevanceScores: newScores }))
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <BookOpen size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Connect your wallet to manage the lexicon</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const isFrozen = corpus?.isFrozen

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lexicon Holder</h1>
          <p className="text-gray-600 mt-1">
            Non-actuating semantic indexer for intent interpretation
          </p>
        </div>
        <button
          onClick={fetchCorpusData}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Corpus Status */}
      {corpus && (
        <div className={`card ${isFrozen ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
          <div className="card-body">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {isFrozen ? (
                  <Lock size={32} className="text-green-600" />
                ) : (
                  <Unlock size={32} className="text-yellow-600" />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Corpus {isFrozen ? 'Frozen' : 'Not Frozen'}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {isFrozen
                      ? 'Corpus is immutably locked for intent interpretation'
                      : 'Corpus can still be modified'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Hash size={14} />
                  Corpus Hash
                </div>
                <p className="font-mono text-sm bg-white p-2 rounded break-all">
                  {corpus.corpusHash}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <FileText size={14} />
                  Storage URI
                </div>
                <a
                  href={corpus.storageUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline break-all"
                >
                  {corpus.storageUri}
                </a>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Calendar size={14} />
                  Corpus Window
                </div>
                <p className="text-gray-900">
                  {corpus.startYear?.toString()} - {corpus.endYear?.toString()}
                </p>
              </div>
              {corpus.frozenAt > 0 && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Frozen At</div>
                  <p className="text-gray-900">
                    {format(new Date(Number(corpus.frozenAt) * 1000), 'PPpp')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Freeze Corpus Form */}
      {!isFrozen && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Lock size={20} />
              Freeze Corpus
            </h3>
          </div>
          <form onSubmit={handleFreezeCorpus} className="card-body space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              <strong>Warning:</strong> Once frozen, the corpus cannot be modified. All intent
              interpretation will use this frozen corpus exclusively.
            </div>

            <div>
              <label className="label">Corpus Content</label>
              <textarea
                value={freezeForm.corpusContent}
                onChange={(e) => setFreezeForm(prev => ({ ...prev, corpusContent: e.target.value }))}
                placeholder="Your contextual corpus content (writings, notes, transcripts, etc.)..."
                className="input min-h-[150px]"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be hashed. Store the original content at the storage URI.
              </p>
            </div>

            <div>
              <label className="label">Storage URI (IPFS/Arweave)</label>
              <input
                type="text"
                value={freezeForm.storageUri}
                onChange={(e) => setFreezeForm(prev => ({ ...prev, storageUri: e.target.value }))}
                placeholder="ipfs://..."
                className="input font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Start Year</label>
                <input
                  type="number"
                  value={freezeForm.startYear}
                  onChange={(e) => setFreezeForm(prev => ({ ...prev, startYear: parseInt(e.target.value) }))}
                  min="1900"
                  max={new Date().getFullYear()}
                  className="input"
                />
              </div>
              <div>
                <label className="label">End Year</label>
                <input
                  type="number"
                  value={freezeForm.endYear}
                  onChange={(e) => setFreezeForm(prev => ({ ...prev, endYear: parseInt(e.target.value) }))}
                  min={freezeForm.startYear}
                  className="input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Lock size={18} />}
              Freeze Corpus
            </button>
          </form>
        </div>
      )}

      {/* Semantic Index Creation */}
      {isFrozen && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Tag size={20} />
              Create Semantic Index
            </h3>
          </div>
          <form onSubmit={handleCreateIndex} className="card-body space-y-4">
            <p className="text-sm text-gray-600">
              Create keyword indices to help the execution agent resolve ambiguity from
              the frozen corpus.
            </p>

            <div>
              <label className="label">Keyword</label>
              <input
                type="text"
                value={indexForm.keyword}
                onChange={(e) => setIndexForm(prev => ({ ...prev, keyword: e.target.value }))}
                placeholder="e.g., open-source, AI safety, education"
                className="input"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Citations & Relevance</label>
                <button
                  type="button"
                  onClick={addCitation}
                  className="btn-secondary text-sm flex items-center gap-1"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <div className="space-y-3">
                {indexForm.citations.map((citation, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <textarea
                      value={citation}
                      onChange={(e) => updateCitation(index, e.target.value)}
                      placeholder="Citation from corpus..."
                      className="input flex-1 min-h-[60px]"
                    />
                    <div className="w-24">
                      <input
                        type="number"
                        value={indexForm.relevanceScores[index]}
                        onChange={(e) => updateScore(index, e.target.value)}
                        min="1"
                        max="100"
                        className="input text-center"
                        placeholder="Score"
                      />
                      <p className="text-xs text-gray-500 text-center mt-1">Score</p>
                    </div>
                    {indexForm.citations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCitation(index)}
                        className="p-2 text-gray-400 hover:text-red-500 mt-2"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
              Create Index
            </button>
          </form>
        </div>
      )}

      {/* Search / Ambiguity Resolution */}
      {isFrozen && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Search size={20} />
              Resolve Ambiguity
            </h3>
          </div>
          <div className="card-body space-y-4">
            <p className="text-sm text-gray-600">
              Query the semantic indices to see how ambiguity would be resolved.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter a query to resolve..."
                className="input flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={submitting}
                className="btn-primary flex items-center gap-2"
              >
                {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
                Search
              </button>
            </div>

            {searchResults && (
              <div className="mt-4 space-y-3">
                <h4 className="font-medium text-gray-900">Results:</h4>
                {searchResults.citations && searchResults.citations.length > 0 ? (
                  searchResults.citations.map((citation, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        searchResults.scores[index] >= 95 ? 'bg-green-100 text-green-700' :
                        searchResults.scores[index] >= 80 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {searchResults.scores[index]}
                      </div>
                      <p className="text-gray-700 flex-1">{citation}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic">No citations found for this query.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="card-body">
          <h3 className="font-semibold text-gray-900 mb-2">About Lexicon Holders</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              Lexicon holders are <strong>non-actuating</strong> semantic indexers
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              They possess no authority to initiate, modify, veto, or influence execution
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              They only provide interpretive citations during active execution
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              After sunset, they cluster archived legacies for discoverability
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Lexicon
