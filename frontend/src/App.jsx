import { useMemo, useState, useRef, useEffect } from 'react'
import './App.css'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000/api/describe/'

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const MAX_MB = 50

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

const processAndCompressFile = (file) => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target.result
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        const MAX_DIM = 1920

        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width
            width = MAX_DIM
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height
            height = MAX_DIM
          }
        }

        canvas.width = Math.round(width)
        canvas.height = Math.round(height)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          if (!blob) return resolve(file)
          if (blob.size >= file.size) return resolve(file)
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          resolve(compressedFile)
        }, 'image/jpeg', 0.85)
      }
      img.onerror = () => resolve(file)
    }
    reader.onerror = () => resolve(file)
  })
}

const compressIfNeeded = async (files) => {
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const MAX_PER_FILE = 4 * 1024 * 1024; // 4MB
  const MAX_TOTAL = 45 * 1024 * 1024; // 45MB

  const needsCompression = (f) => f.size > MAX_PER_FILE || totalSize > MAX_TOTAL;

  return Promise.all(
    files.map(f => needsCompression(f) ? processAndCompressFile(f) : Promise.resolve(f))
  );
}

// Icons
const ClipIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
  </svg>
)

const SendIcon = () => (
  <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path fill="currentColor" fillRule="evenodd" d="M12 3a1 1 0 0 1 .7.3l8 8a1 1 0 0 1-1.4 1.4L13 6.4V20a1 1 0 1 1-2 0V6.4l-6.3 6.3a1 1 0 0 1-1.4-1.4l8-8A1 1 0 0 1 12 3Z" clipRule="evenodd"></path>
  </svg>
)

function ImageThumb({ file }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  if (!url) return null;
  return <img src={url} alt="preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
}

function App() {
  const [files, setFiles] = useState([])
  const [hint, setHint] = useState('')
  const [ean, setEan] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [condition, setCondition] = useState('USED_EXCELLENT')

  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [passcode, setPasscode] = useState('')
  const [authError, setAuthError] = useState('')

  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [result, busy])

  useEffect(() => {
    const saved = localStorage.getItem('passcode');
    if (saved) {
      const authUrl = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace('describe/', 'auth')
        : 'http://localhost:8000/api/auth';

      fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: saved })
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setIsAuthorized(true);
          } else {
            localStorage.removeItem('passcode');
          }
        })
        .catch(e => console.error('Auth error:', e))
        .finally(() => setAuthChecking(false));
    } else {
      setAuthChecking(false);
    }
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthChecking(true);
    setAuthError('');
    try {
      const authUrl = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace('describe/', 'auth')
        : 'http://localhost:8000/api/auth';

      const resp = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        localStorage.setItem('passcode', passcode);
        setIsAuthorized(true);
      } else {
        setAuthError(data.error || 'Invalid Passcode');
      }
    } catch (err) {
      setAuthError('Connection error');
    } finally {
      setAuthChecking(false);
    }
  };

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
      fd.append('condition', condition)
      const savedPasscode = localStorage.getItem('passcode');
      if (savedPasscode) fd.append('passcode', savedPasscode);

      const resp = await fetch(API_URL, {
        method: 'POST',
        body: fd,
      })

      if (resp.status === 401) {
        localStorage.removeItem('passcode');
        setIsAuthorized(false);
        setBusy(false);
        return;
      }

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

  if (authChecking && !isAuthorized) {
    return <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loader"><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
    </div>;
  }

  if (!isAuthorized) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
        <div className="auth-modal" style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '8px', color: '#fff' }}>Access Restricted</h2>
          <p style={{ color: '#a0a0a0', marginBottom: '24px', fontSize: '14px' }}>Please enter the passcode to continue</p>
          <form onSubmit={handleAuth}>
            <input
              type="password"
              placeholder="Enter passcode..."
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#252525', color: '#fff', marginBottom: '16px', outline: 'none' }}
              autoFocus
            />
            {authError && <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>{authError}</div>}
            <button
              type="submit"
              disabled={authChecking || !passcode}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: passcode ? 'pointer' : 'not-allowed', opacity: authChecking || !passcode ? 0.7 : 1 }}
            >
              {authChecking ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {!showChat && Object.keys(result || {}).length === 0 && (
        <header className="header" style={{ borderBottom: 'none', background: 'transparent' }}>

        </header>
      )}
      {showChat && (
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
          <span>Antik Halle KI</span>
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
                onChange={async (e) => {
                  setBusy(true)
                  const selected = Array.from(e.target.files)
                  const compressed = await compressIfNeeded(selected)
                  setFiles(compressed)
                  setBusy(false)
                }}
              />
              {files.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div className="file-badge-grid" style={{ justifyContent: 'center', marginBottom: '12px' }}>
                    <div className="file-badge">
                      {fileMeta.msg || `${files.length} file(s)`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {files.map((f, i) => <ImageThumb key={i} file={f} />)}
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
              <div className="condition-select" style={{ display: 'flex', gap: '20px', marginTop: '12px', marginBottom: '16px', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'rgb(121 122 122)', opacity: busy ? 0.5 : 1 }}>
                  <input
                    type="radio"
                    name="main_condition"
                    value="NEW_OTHER"
                    checked={condition === 'NEW_OTHER'}
                    onChange={(e) => setCondition(e.target.value)}
                    disabled={busy}
                  />
                  Neu: Sonstige
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'rgb(121 122 122)', opacity: busy ? 0.5 : 1 }}>
                  <input
                    type="radio"
                    name="main_condition"
                    value="USED_EXCELLENT"
                    checked={condition === 'USED_EXCELLENT'}
                    onChange={(e) => setCondition(e.target.value)}
                    disabled={busy}
                  />
                  Gebraucht
                </label>
              </div>
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
                  placeholder="Item type/name (e.g. Vase, Switch)..."
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {files.map((f, i) => <ImageThumb key={i} file={f} />)}
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
                    {/* Descriptions removed per request */}
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
                            <span>✨ Draft Created Successfully!</span>
                            <span style={{ fontSize: '14px', color: '#059669' }}>Please check your <b>"Scheduled" (Geplant)</b> listings on eBay!</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>SKU: {result.ebay.sku}</span>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>
                              {result.ebay.listingId ? `Listing ID: ${result.ebay.listingId}` : `Offer ID: ${result.ebay.offerId}`}
                            </span>
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

            {result && !busy && (
              <div className="large-upload-zone" style={{ margin: '40px auto 20px auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <button
                  type="button"
                  className="huge-upload-btn"
                  onClick={() => document.getElementById('chat-file-input').click()}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <span>Add Photos</span>
                </button>
                <input
                  id="chat-file-input"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const selected = Array.from(e.target.files);
                    if (selected.length > 0) {
                      setBusy(true)
                      const compressed = await compressIfNeeded(selected)
                      setFiles(compressed);
                      setResult(null);
                      setError('');
                      setHint('');
                      setEan('');
                      setBusy(false)
                    }
                  }}
                />
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

            <div className="condition-select" style={{ display: 'flex', gap: '20px', marginTop: '12px', marginBottom: '16px', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#333', opacity: busy ? 0.5 : 1 }}>
                <input
                  type="radio"
                  name="chat_condition"
                  value="NEW_OTHER"
                  checked={condition === 'NEW_OTHER'}
                  onChange={(e) => setCondition(e.target.value)}
                  disabled={busy}
                />
                Neu: Sonstige
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#333', opacity: busy ? 0.5 : 1 }}>
                <input
                  type="radio"
                  name="chat_condition"
                  value="USED_EXCELLENT"
                  checked={condition === 'USED_EXCELLENT'}
                  onChange={(e) => setCondition(e.target.value)}
                  disabled={busy}
                />
                Gebraucht
              </label>
            </div>

            <div className="main-input-wrap">

              <input
                type="text"
                placeholder="Item type/name (e.g. Vase, Switch)..."
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <div className="file-badge-grid">
                  <div className="file-badge">
                    {fileMeta.msg || `${files.length} file(s)`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {files.map((f, i) => <ImageThumb key={i} file={f} />)}
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
