import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { VinCandidate } from '../../vin/extract.ts'
import {
  clampRect,
  displayedToNaturalRect,
  isRectTooSmall,
  normalizeRect,
  outsideDimRects,
  padRectForOcr,
  type Point,
  type Rect,
  type Size,
} from './cropGeometry.ts'
import { terminateOcrWorker } from './ocr.ts'
import { scanPhotoForVin, type ImageSource, type OcrMode } from './scanPhoto.ts'
import { Button } from '../ui/Button.tsx'
import { VinCandidateCard } from './VinCandidateCard.tsx'

type ScanScope = 'whole' | 'selection'

function cropToCanvas(image: HTMLImageElement, rect: Rect): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width))
  canvas.height = Math.max(1, Math.round(rect.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function PhotoSection() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null)
  const [candidates, setCandidates] = useState<VinCandidate[] | null>(null)
  const [scanScope, setScanScope] = useState<ScanScope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [dragRect, setDragRect] = useState<Rect | null>(null)
  const [selectionHint, setSelectionHint] = useState<string | null>(null)
  const runIdRef = useRef(0)
  const previewUrlRef = useRef<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const selectionSurfaceRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<Point | null>(null)

  // The worker is shared across scans while the drawer stays open; free it once
  // the section (and with it, the drawer) unmounts.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      void terminateOcrWorker()
    }
  }, [])

  // Move focus onto the selection surface when entering selection mode, so its
  // label and the instructions below it are announced.
  useEffect(() => {
    if (selectionMode) selectionSurfaceRef.current?.focus()
  }, [selectionMode])

  function cancelSelection() {
    setSelectionMode(false)
    setDragRect(null)
    setSelectionHint(null)
    dragStartRef.current = null
  }

  async function runScan(input: ImageSource, scope: ScanScope) {
    // Bumping here (not just in handleFile) is what lets a selection scan
    // supersede an in-flight whole-photo scan, and vice versa.
    const thisRun = ++runIdRef.current
    setError(null)
    setProgress({ label: 'Preparing image…', pct: 0 })
    const mode: OcrMode = scope === 'selection' ? 'crop' : 'photo'

    try {
      const result = await scanPhotoForVin(
        input,
        (label, prog) => {
          if (thisRun !== runIdRef.current) return
          setProgress({ label, pct: Math.round(prog * 100) })
        },
        { mode },
      )
      if (thisRun !== runIdRef.current) return // superseded while OCR ran

      setCandidates(result)
      setScanScope(scope)
    } catch (err) {
      if (thisRun !== runIdRef.current) return
      setError(err instanceof Error ? err.message : 'OCR failed.')
    } finally {
      if (thisRun === runIdRef.current) setProgress(null)
    }
  }

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
    setScanScope(null)
    setLoadedImage(null)
    cancelSelection()

    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch {
      if (thisRun === runIdRef.current) setError('Could not read that image file.')
      return
    }
    if (thisRun !== runIdRef.current) return // a newer file arrived while this one decoded

    setLoadedImage(image)
    await runScan({ source: image, width: image.naturalWidth, height: image.naturalHeight }, 'whole')
  }

  async function scanSelection() {
    if (!loadedImage || !dragRect || !imgRef.current) return
    const displayedRect = imgRef.current.getBoundingClientRect()
    const natural = { width: loadedImage.naturalWidth, height: loadedImage.naturalHeight }
    const naturalRect = displayedToNaturalRect(dragRect, { width: displayedRect.width, height: displayedRect.height }, natural)
    // Pad past the user's exact drag — a tight box gives OCR no quiet margin and
    // crops off the anti-aliased edge of the last character or two.
    const paddedRect = padRectForOcr(naturalRect, natural)
    const canvas = cropToCanvas(loadedImage, paddedRect)
    setSelectionMode(false)
    await runScan({ source: canvas, width: canvas.width, height: canvas.height }, 'selection')
  }

  async function rescanWholePhoto() {
    if (!loadedImage) return
    await runScan({ source: loadedImage, width: loadedImage.naturalWidth, height: loadedImage.naturalHeight }, 'whole')
  }

  function imgBounds(): Size {
    const rect = imgRef.current?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : { width: 0, height: 0 }
  }

  function pointFromEvent(e: ReactPointerEvent<HTMLDivElement>): Point {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Some pointer sources (e.g. a synthetically dispatched pointer event)
      // don't have a capturable native pointer — the drag still works without it.
    }
    dragStartRef.current = pointFromEvent(e)
    setDragRect(null)
    setSelectionHint(null)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    const rect = clampRect(normalizeRect(dragStartRef.current, pointFromEvent(e)), imgBounds())
    setDragRect(rect)
  }

  function handlePointerUp() {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    if (dragRect && isRectTooSmall(dragRect)) {
      setSelectionHint('That selection is too small — drag a bigger box around the VIN.')
      setDragRect(null)
    }
  }

  function handlePointerCancel() {
    dragStartRef.current = null
  }

  // Escape cancels selection mode here without bubbling up to the drawer's own
  // Escape handler (VinToolPanel), which would otherwise close the whole drawer.
  function handleSectionKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    if (selectionMode && e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancelSelection()
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

  const dimRects = dragRect ? outsideDimRects(dragRect, imgBounds()) : []

  return (
    <section className="vin-tool-section stack" aria-labelledby="vin-tool-photo-heading" onKeyDown={handleSectionKeyDown}>
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
          <img ref={imgRef} src={previewUrl} alt="Selected image preview" className="vin-tool-preview" />

          {selectionMode ? (
            <div
              ref={selectionSurfaceRef}
              className="vin-tool-crop-surface"
              tabIndex={0}
              aria-label="VIN selection area"
              aria-describedby="vin-tool-crop-hint"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              {dimRects.map((dim, i) => (
                <div
                  key={i}
                  className="vin-tool-crop-dim"
                  style={{ left: dim.x, top: dim.y, width: dim.width, height: dim.height }}
                />
              ))}
              {dragRect ? (
                <div
                  className="vin-tool-crop-rect"
                  style={{ left: dragRect.x, top: dragRect.y, width: dragRect.width, height: dragRect.height }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectionMode ? (
        <div className="stack-sm">
          <p id="vin-tool-crop-hint" className="text-caption" role="status" aria-live="polite">
            {selectionHint ?? (dragRect ? 'Selection ready. Press Scan selection to scan it, or drag again to redraw.' : 'Drag over the VIN to select it.')}
          </p>
          <div className="row">
            <Button type="button" variant="secondary" size="sm" onClick={() => void scanSelection()} disabled={!dragRect}>
              Scan selection
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancelSelection}>
              Cancel
            </Button>
          </div>
        </div>
      ) : loadedImage ? (
        <div className="row">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
            Select area
          </Button>
          {scanScope === 'selection' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void rescanWholePhoto()}>
              Scan whole photo
            </Button>
          ) : null}
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
        <div className="stack-sm">
          <p className="text-caption">{scanScope === 'selection' ? 'Results from selected area' : 'Results from whole photo'}</p>
          {candidates.length > 0 ? (
            candidates.map((candidate) => <VinCandidateCard key={candidate.vin} candidate={candidate} />)
          ) : (
            <p className="text-body-sm text-mute">
              No VIN found in this image. Try a sharper photo taken straight on, select just the VIN line, or use Check a
              single VIN below.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
