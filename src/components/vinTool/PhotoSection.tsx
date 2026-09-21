import { useEffect, useRef, useState } from 'react'
import type { VinCandidate } from '../../vin/extract.ts'
import { terminateOcrWorker } from './ocr.ts'
import { scanPhotoForVin } from './scanPhoto.ts'
import { VinCandidateCard } from './VinCandidateCard.tsx'

export function PhotoSection() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null)
  const [candidates, setCandidates] = useState<VinCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runIdRef = useRef(0)
  const previewUrlRef = useRef<string | null>(null)

  // The worker is shared across scans while the drawer stays open; free it once
  // the section (and with it, the drawer) unmounts.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      void terminateOcrWorker()
    }
  }, [])

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.')
      return
    }

    const thisRun = ++runIdRef.current

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setError(null)
    setCandidates(null)

    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch {
      if (thisRun === runIdRef.current) setError('Could not read that image file.')
      return
    }
    if (thisRun !== runIdRef.current) return // a newer file arrived while this one decoded

    setProgress({ label: 'Preparing image…', pct: 0 })

    try {
      const candidates = await scanPhotoForVin(image, (label, prog) => {
        if (thisRun !== runIdRef.current) return
        setProgress({ label, pct: Math.round(prog * 100) })
      })
      if (thisRun !== runIdRef.current) return // superseded while OCR ran

      setCandidates(candidates)
    } catch (err) {
      if (thisRun !== runIdRef.current) return
      setError(err instanceof Error ? err.message : 'OCR failed.')
    } finally {
      if (thisRun === runIdRef.current) setProgress(null)
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) void handleFile(file)
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="vin-tool-section stack" aria-labelledby="vin-tool-photo-heading">
      <h3 id="vin-tool-photo-heading" className="text-heading-sm">
        Photo
      </h3>

      <div className="vin-tool-photo-drop">
        <input
          id="vin-tool-photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          className="vin-tool-photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <label
          htmlFor="vin-tool-photo-input"
          className={`vin-tool-photo-label${dragOver ? ' drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) void handleFile(file)
          }}
        >
          <span className="btn btn-primary">Choose or drop a photo</span>
          <span className="text-caption">
            Upload a file, take a photo, or paste an image with Ctrl+V (or Cmd+V on Mac).
          </span>
        </label>
      </div>

      {previewUrl ? (
        <div className="vin-tool-preview-wrap">
          <img src={previewUrl} alt="Selected image preview" className="vin-tool-preview" />
        </div>
      ) : null}

      {progress ? (
        <div className="stack-sm" role="status" aria-live="polite">
          <div className="vin-tool-progress-bar">
            <div className="vin-tool-progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="text-caption">
            {progress.label} ({progress.pct}%)
          </p>
        </div>
      ) : null}

      {error ? <p className="text-error text-body-sm">{error}</p> : null}

      {candidates ? (
        candidates.length > 0 ? (
          <div className="stack-sm">
            {candidates.map((candidate) => (
              <VinCandidateCard key={candidate.vin} candidate={candidate} />
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-mute">
            No VIN found in this image. Try a sharper photo taken straight on, or use Check a single VIN below.
          </p>
        )
      ) : null}
    </section>
  )
}
