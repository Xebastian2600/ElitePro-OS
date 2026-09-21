import { useEffect, useRef } from 'react'
import { Button } from '../ui/Button.tsx'
import { PhotoSection } from './PhotoSection.tsx'
import { TextSection } from './TextSection.tsx'
import { ManualVinSection } from './ManualVinSection.tsx'
import '../../styles/vinTool.css'

export const VIN_TOOL_PANEL_ID = 'vin-tool-panel'

export interface VinToolPanelProps {
  open: boolean
  onClose: () => void
}

export function VinToolPanel({ open, onClose }: VinToolPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Move focus into the drawer whenever it opens, mirroring how the mobile
  // nav menu is expected to behave for keyboard users.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  // Escape closes the drawer; the caller's onClose is responsible for
  // returning focus to the toggle that opened it.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      // A section (e.g. PhotoSection's crop selection) may already have handled
      // its own Escape and marked it defaultPrevented — that shouldn't also close
      // the drawer.
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <aside id={VIN_TOOL_PANEL_ID} className="vin-tool-panel" aria-label="VIN tool">
      <div className="vin-tool-header">
        <h2 ref={headingRef} tabIndex={-1} className="text-heading-md">
          VIN tool
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <PhotoSection />
      <TextSection />
      <ManualVinSection />
    </aside>
  )
}
