import React, { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, Check, AlertCircle, File } from 'lucide-react'
import toast from 'react-hot-toast'

const ACCEPTED_TYPES = {
  'text/plain': { ext: '.txt', name: 'Text' },
  'text/markdown': { ext: '.md', name: 'Markdown' },
  'application/json': { ext: '.json', name: 'JSON' },
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function DocumentUploadArea({ onDocumentImport, targetField = 'intentDocument' }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [extractedContent, setExtractedContent] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef(null)

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const validateFile = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds 5MB limit')
      return false
    }

    const fileExt = file.name.toLowerCase().split('.').pop()
    const isValidType = Object.keys(ACCEPTED_TYPES).includes(file.type) ||
                        ['txt', 'md', 'json'].includes(fileExt)

    if (!isValidType) {
      toast.error('Unsupported file type. Please use .txt, .md, or .json files')
      return false
    }

    return true
  }

  const extractContent = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        let content = e.target.result

        // Handle JSON files - extract readable content
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
          try {
            const parsed = JSON.parse(content)
            // Try to extract meaningful content from JSON
            if (typeof parsed === 'string') {
              content = parsed
            } else if (parsed.content) {
              content = parsed.content
            } else if (parsed.text) {
              content = parsed.text
            } else if (parsed.document) {
              content = parsed.document
            } else {
              content = JSON.stringify(parsed, null, 2)
            }
          } catch {
            // If JSON parsing fails, use as-is
          }
        }

        resolve(content)
      }

      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  const processFile = async (file) => {
    if (!validateFile(file)) return

    setIsProcessing(true)
    try {
      const content = await extractContent(file)
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
      })
      setExtractedContent(content)
      toast.success(`Document "${file.name}" loaded successfully`)
    } catch (err) {
      console.error('Failed to process file:', err)
      toast.error('Failed to process document')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }

  const handleFileSelect = (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleImport = () => {
    if (extractedContent && onDocumentImport) {
      onDocumentImport(extractedContent, targetField)
      toast.success(`Content imported to ${targetField === 'intentDocument' ? 'Intent Document' : 'Corpus Content'}`)
    }
  }

  const handleClear = () => {
    setUploadedFile(null)
    setExtractedContent('')
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`upload-dropzone ${isDragging ? 'upload-dropzone-active' : ''} ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json,text/plain,text/markdown,application/json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={`p-3 rounded-full ${isDragging ? 'bg-primary-100' : 'bg-gray-100'}`}>
            <Upload size={24} className={isDragging ? 'text-primary-600' : 'text-gray-400'} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              {isDragging ? 'Drop your document here' : 'Drag and drop a document'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or click to browse
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <FileText size={14} />
            <span>Supports .txt, .md, .json (max 5MB)</span>
          </div>
        </div>
      </div>

      {/* Uploaded File Preview */}
      {uploadedFile && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <File size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(uploadedFile.size)}</p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove file"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content Preview */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Preview</label>
            <div className="bg-white border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                {extractedContent.slice(0, 500)}
                {extractedContent.length > 500 && (
                  <span className="text-gray-400">... ({extractedContent.length - 500} more characters)</span>
                )}
              </pre>
            </div>
          </div>

          {/* Import Actions */}
          <div className="flex items-center gap-3">
            <select
              value={targetField}
              onChange={(e) => onDocumentImport && onDocumentImport(extractedContent, e.target.value)}
              className="input text-sm flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="intentDocument">Import to Intent Document</option>
              <option value="corpusContent">Import to Corpus Content</option>
            </select>
            <button
              onClick={handleImport}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Check size={16} />
              Import
            </button>
          </div>
        </div>
      )}

      {/* Help Text */}
      {!uploadedFile && (
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <p>
            Import documents to auto-populate form fields. The content will be extracted
            and can be edited before submission.
          </p>
        </div>
      )}
    </div>
  )
}

export default DocumentUploadArea
