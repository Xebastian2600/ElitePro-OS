import { useState } from 'react'
import type { VinCandidate } from '../../vin/extract.ts'
import { modelYear } from '../../vin/vin.ts'
import { decodeVin, type DecodedVin } from '../../vin/nhtsa.ts'
import { Button } from '../ui/Button.tsx'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { DecodeDetails } from './DecodeDetails.tsx'

export interface VinCandidateCardProps {
  candidate: VinCandidate
}

export function VinCandidateCard({ candidate }: VinCandidateCardProps) {
  const [copied, setCopied] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [decoded, setDecoded] = useState<DecodedVin | null>(null)

  const year = modelYear(candidate.vin)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(candidate.vin)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  async function handleDecode() {
    setDecoding(true)
    setDecodeError(null)
    try {
      const result = await decodeVin(candidate.vin)
      setDecoded(result)
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'Could not look up this VIN.')
    } finally {
      setDecoding(false)
    }
  }

  return (
    <article className="card stack-sm">
      <div className="row-between">
        <code className="vin-tool-vin-code">{candidate.vin}</code>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <span className={`badge ${candidate.checkDigitValid ? 'badge-success' : 'badge-warning'}`}>
        <span className="badge__dot" aria-hidden="true" />
        {candidate.checkDigitValid ? 'Check digit valid' : 'Check digit not valid'}
      </span>

      {candidate.corrected ? (
        <p className="text-caption">
          OCR fix: I/O/Q read as 1/0/0. Raw text: <code>{candidate.raw}</code>
        </p>
      ) : null}

      {candidate.suggestions.length > 0 ? (
        <div className="stack-sm">
          <p className="text-caption">Possible misread. Did you mean:</p>
          <div className="row">
            {candidate.suggestions.map((suggestion) => (
              <span key={suggestion} className="pill">
                {suggestion}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {year !== null ? <p className="text-caption">Model year (from VIN): {year}</p> : null}

      <Button type="button" variant="secondary" size="sm" onClick={() => void handleDecode()} disabled={decoding}>
        Decode
      </Button>

      {decoding ? <LoadingLine label="Looking up vehicle details…" /> : null}
      {decodeError ? <p className="text-error text-body-sm">Could not look up this VIN: {decodeError}</p> : null}
      {decoded ? <DecodeDetails decoded={decoded} /> : null}
    </article>
  )
}
