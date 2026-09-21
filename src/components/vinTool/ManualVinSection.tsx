import { useMemo, useState } from 'react'
import { normalizeVin, hasValidFormat, computeCheckDigit, modelYear } from '../../vin/vin.ts'
import { decodeVin, type DecodedVin } from '../../vin/nhtsa.ts'
import { TextField } from '../ui/TextField.tsx'
import { Button } from '../ui/Button.tsx'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { DecodeDetails } from './DecodeDetails.tsx'

export function ManualVinSection() {
  const [raw, setRaw] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [decoded, setDecoded] = useState<DecodedVin | null>(null)

  const normalized = normalizeVin(raw)
  const illegalChars = useMemo(
    () => [...new Set(normalized.match(/[^A-HJ-NPR-Z0-9]/g) ?? [])],
    [normalized],
  )
  const validFormat = hasValidFormat(normalized)
  const expectedCheckDigit = normalized.length === 17 && validFormat ? computeCheckDigit(normalized) : null
  const checkDigitValid = expectedCheckDigit !== null && expectedCheckDigit === normalized[8]
  const year = normalized.length === 17 && validFormat ? modelYear(normalized) : null
  const decodeEnabled = normalized.length === 17 && validFormat

  function handleChange(value: string) {
    setRaw(value)
    setDecoded(null)
    setDecodeError(null)
  }

  async function handleDecode() {
    if (!decodeEnabled) return
    setDecoding(true)
    setDecodeError(null)
    try {
      const result = await decodeVin(normalized)
      setDecoded(result)
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'Could not look up this VIN.')
    } finally {
      setDecoding(false)
    }
  }

  return (
    <section className="vin-tool-section stack" aria-labelledby="vin-tool-manual-heading">
      <h3 id="vin-tool-manual-heading" className="text-heading-sm">
        Check a single VIN
      </h3>

      <TextField
        label="VIN"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
      />

      <div className="stack-sm">
        <p className="text-caption">Length: {normalized.length}/17</p>

        {illegalChars.length > 0 ? (
          <p className="text-error text-body-sm">Not allowed in a VIN: {illegalChars.join(' ')}</p>
        ) : null}

        {normalized.length === 17 && validFormat ? (
          <span className={`badge ${checkDigitValid ? 'badge-success' : 'badge-warning'}`}>
            <span className="badge__dot" aria-hidden="true" />
            {checkDigitValid
              ? `Check digit valid (position 9: ${normalized[8]})`
              : `Check digit not valid: expected ${expectedCheckDigit}, found ${normalized[8]}`}
          </span>
        ) : null}

        {year !== null ? (
          <p className="text-caption">
            {checkDigitValid ? `Model year (from VIN): ${year}` : `Model year (if North American format): ${year}`}
          </p>
        ) : null}
      </div>

      <Button type="button" variant="secondary" size="sm" onClick={() => void handleDecode()} disabled={!decodeEnabled || decoding}>
        Decode
      </Button>

      {decoding ? <LoadingLine label="Looking up vehicle details…" /> : null}
      {decodeError ? <p className="text-error text-body-sm">Could not look up this VIN: {decodeError}</p> : null}
      {decoded ? <DecodeDetails decoded={decoded} /> : null}
    </section>
  )
}
