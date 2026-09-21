import { useState } from 'react'
import { findVins, type VinCandidate } from '../../vin/extract.ts'
import { TextArea } from '../ui/TextArea.tsx'
import { Button } from '../ui/Button.tsx'
import { VinCandidateCard } from './VinCandidateCard.tsx'

export function TextSection() {
  const [text, setText] = useState('')
  const [candidates, setCandidates] = useState<VinCandidate[] | null>(null)

  function handleScan() {
    setCandidates(findVins(text))
  }

  return (
    <section className="vin-tool-section stack" aria-labelledby="vin-tool-text-heading">
      <h3 id="vin-tool-text-heading" className="text-heading-sm">
        Text
      </h3>
      <TextArea
        label="Paste text containing a VIN"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a window sticker, title, or any text…"
        rows={4}
      />
      <Button type="button" variant="secondary" size="sm" onClick={handleScan}>
        Find VINs
      </Button>

      {candidates ? (
        candidates.length > 0 ? (
          <div className="stack-sm">
            {candidates.map((candidate) => (
              <VinCandidateCard key={candidate.vin} candidate={candidate} />
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-mute">
            No VIN found in this text. Check for typos or extra characters, or use Check a single VIN below.
          </p>
        )
      ) : null}
    </section>
  )
}
