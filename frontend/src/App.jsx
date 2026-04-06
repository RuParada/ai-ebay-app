import { useMemo, useState, useRef, useEffect } from 'react'
import './App.css'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000/api/describe/'

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const MAX_MB = 5

function extOf(name) {
  const lower = (name || '').toLowerCase()
  const idx = lower.lastIndexOf('.')
  return idx >= 0 ? lower.slice(idx) : ''
}

function formatUnknown(obj) {
  if (obj == null) return ''
  if (typeof obj === 'string') return obj
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

// Icons
const ClipIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
  </svg>
)

const SendIcon = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
    <path fill="currentColor" fillRule="evenodd" d="M12 3a1 1 0 0 1 .7.3l8 8a1 1 0 0 1-1.4 1.4L13 6.4V20a1 1 0 1 1-2 0V6.4l-6.3 6.3a1 1 0 0 1-1.4-1.4l8-8A1 1 0 0 1 12 3Z" clipRule="evenodd"></path>
  </svg>
)

function App() {
  const [files, setFiles] = useState([])
  const [hint, setHint] = useState('')
  const [ean, setEan] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [result, busy])

  const fileMeta = useMemo(() => {
    if (!files || files.length === 0) return { ok: true, msg: '' }
    let totalSize = 0
    for (const f of files) {
      const suffix = extOf(f.name)
      if (!SUPPORTED_EXT.has(suffix)) return { ok: false, msg: `Unsupported format: ${f.name}` }
      totalSize += f.size
    }
    const sizeMb = totalSize / (1024 * 1024)
    if (sizeMb > MAX_MB) return { ok: false, msg: `Total size too large (${sizeMb.toFixed(1)} MB)` }
    return { ok: true, msg: `${files.length} file(s) attached (${Math.round(sizeMb * 10) / 10} MB)` }
  }, [files])

  async function onSubmit(e) {
    if (e) e.preventDefault()
    setError('')
    setResult(null)

    if (!files || files.length === 0) {
      setError('Please attach at least one image.')
      return
    }
    if (!fileMeta.ok) {
      setError(fileMeta.msg)
      return
    }

    setBusy(true)
    try {
      const fd = new FormData()
      for (const f of files) {
        fd.append('file', f)
      }
      if (ean.trim()) fd.append('ean', ean.trim())
      if (hint.trim()) fd.append('hint', hint.trim())

      const resp = await fetch(API_URL, {
        method: 'POST',
        body: fd,
      })

      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data?.error ? String(data.error) : `HTTP Error ${resp.status}`)
        return
      }
      setResult(data)
    } catch (err) {
      setError(err?.message ? String(err.message) : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  }

  const showChat = busy || result || error

  return (
    <div className="app-container">
      {!showChat && Object.keys(result || {}).length === 0 && (
        <header className="header" style={{ borderBottom: 'none', background: 'transparent' }}>
          
        </header>
      )}
      {showChat && (
        <header className="header">
          Antik Halle KI
        </header>
      )}

      <main className={`chat-area ${!showChat ? 'chat-area-empty' : ''}`}>
        {!showChat ? (
          <div className="empty-state">
            <h1 className="main-title">Antik Halle KI</h1>
            <p className="main-subtitle">Attach product images to generate eBay listing</p>
            
            <div className="large-upload-zone">
               <button 
                 type="button" 
                 className="huge-upload-btn" 
                 disabled={busy}
                 onClick={() => document.getElementById('main-file-input').click()}
               >
                 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                   <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                   <circle cx="8.5" cy="8.5" r="1.5"></circle>
                   <polyline points="21 15 16 10 5 21"></polyline>
                 </svg>
                 <span>Add Photos</span>
               </button>
               <input
                 id="main-file-input"
                 type="file"
                 multiple
                 accept=".jpg,.jpeg,.png,.gif,.webp"
                 disabled={busy}
                 style={{ display: 'none' }}
                 onChange={(e) => setFiles(Array.from(e.target.files))}
               />
               {files.length > 0 && (
                 <div className="file-badge-grid" style={{ marginTop: '16px', justifyContent: 'center' }}>
                   <div className="file-badge">
                     {fileMeta.msg || `${files.length} file(s)`}
                   </div>
                 </div>
               )}
            </div>
            
            <div className="input-container centered-input">
              {error && (
                <div className="error-banner">
                  {error}
                </div>
              )}
              <div className="extra-inputs">
                <input
                  type="text"
                  placeholder="SKU (optional)"
                  value={ean}
                  onChange={(e) => setEan(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="main-input-wrap">
                <input
                  type="text"
                  placeholder="Additional hint or description..."
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy}
                />
                <button
                  className="icon-btn send-btn"
                  onClick={onSubmit}
                  disabled={busy || files.length === 0}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="message user-message">
              <div className="user-bubble">
                <div><strong>SKU:</strong> {ean || 'N/A'}</div>
                {hint && <div><strong>Hint:</strong> {hint}</div>}
                <div style={{ opacity: 0.8, fontSize: '13px', marginTop: '4px' }}>
                  [ Attached {files.length} image(s) ]
                </div>
              </div>
            </div>

            {busy && (
              <div className="message ai-message">
                <div className="ai-bubble">
                  <div className="ai-bubble-content">
                    <div className="loader">
                      <div className="dot"></div>
                      <div className="dot"></div>
                      <div className="dot"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className="message ai-message" style={{ paddingBottom: '30px' }}>
                <div className="ai-bubble">
                  <div className="ai-bubble-content">
                    {result.title && (
                      <div className="result-group">
                        <div className="result-label">Title</div>
                        <div className="result-value">{result.title}</div>
                      </div>
                    )}
                    {result.short_description && (
                      <div className="result-group">
                        <div className="result-label">Short Description</div>
                        <div className="result-value">{result.short_description}</div>
                      </div>
                    )}
                    {result.full_description && (
                      <div className="result-group">
                        <div className="result-label">Full Description</div>
                        <div className="result-value">{result.full_description}</div>
                      </div>
                    )}
                    {result.category && (
                      <div className="result-group">
                        <div className="result-label">Category</div>
                        <div className="result-value">{result.category}</div>
                      </div>
                    )}
                    {result.tags && (
                      <div className="result-group">
                        <div className="result-label">Tags</div>
                        <div className="tags-list">
                          {Array.isArray(result.tags)
                            ? result.tags.map((t, idx) => <span key={idx} className="tag-item">{t}</span>)
                            : String(result.tags).split(',').map((t, idx) => <span key={idx} className="tag-item">{t.trim()}</span>)
                          }
                        </div>
                      </div>
                    )}
                    {result.ebay && (
                      <div className="result-group">
                        <div className="result-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                          </svg>
                          eBay Integration
                        </div>
                        {result.ebay.status === 'success' && (
                          <div className="result-value" style={{ color: '#10b981', fontWeight: '500', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span>Draft Created Successfully!</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>SKU: {result.ebay.sku}</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>Offer ID: {result.ebay.offerId}</span>
                          </div>
                        )}
                        {result.ebay.status === 'partial' && (
                          <div className="result-value" style={{ color: '#d97706', fontWeight: '500', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span>Inventory Item Created, Offer Failed</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>SKU: {result.ebay.sku}</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>{result.ebay.warning}</span>
                          </div>
                        )}
                        {result.ebay.status === 'error' && (
                          <div className="result-value" style={{ color: '#ef4444', fontWeight: '500', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span>Draft Creation Failed</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>{result.ebay.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {result._usage && (
                      <div className="usage" style={{ marginTop: '24px', opacity: 0.5, fontSize: '12px' }}>
                        tokens: in {result._usage.input_tokens} | out {result._usage.output_tokens}
                      </div>
                    )}
                    {result.raw && (
                      <details className="raw" style={{ marginTop: '16px' }}>
                        <summary style={{ cursor: 'pointer', opacity: 0.7, fontSize: '13px' }}>Raw Output</summary>
                        <pre>{formatUnknown(result.raw)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef}></div>
          </>
        )}
      </main>

      {showChat && (
        <section className="input-area">
          <div className="input-container">

            {error && (
              <div className="error-banner">
                {error}
              </div>
            )}

            <div className="extra-inputs">
            <input
              type="text"
              placeholder="SKU (optional)"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="main-input-wrap">
            <div className="file-input-wrapper">
              <button type="button" className="icon-btn" disabled={busy}>
                <ClipIcon />
              </button>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.gif,.webp"
                disabled={busy}
                onChange={(e) => setFiles(Array.from(e.target.files))}
              />
            </div>

            <input
              type="text"
              placeholder="Images..."
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
            />

            <button
              className="icon-btn send-btn"
              onClick={onSubmit}
              disabled={busy || files.length === 0}
            >
              <SendIcon />
            </button>
          </div>

          {files.length > 0 && (
            <div className="file-badge-grid">
              <div className="file-badge">
                {fileMeta.msg || `${files.length} file(s)`}
              </div>
            </div>
          )}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
