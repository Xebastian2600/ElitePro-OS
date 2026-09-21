import type { DecodedVin } from '../../vin/nhtsa.ts'

const FIELD_LABELS: Array<[keyof DecodedVin, string]> = [
  ['make', 'Make'],
  ['model', 'Model'],
  ['year', 'Year'],
  ['trim', 'Trim'],
  ['bodyClass', 'Body'],
  ['engine', 'Engine'],
  ['fuel', 'Fuel'],
  ['manufacturer', 'Manufacturer'],
  ['plantCountry', 'Plant country'],
]

export interface DecodeDetailsProps {
  decoded: DecodedVin
}

export function DecodeDetails({ decoded }: DecodeDetailsProps) {
  const fields = FIELD_LABELS.filter(([key]) => {
    const value = decoded[key]
    return value !== undefined && value !== ''
  })

  return (
    <div className="stack-sm">
      {decoded.errorCode !== '0' && decoded.errorText ? (
        <p className="text-body-sm text-mute">{decoded.errorText}</p>
      ) : null}
      {fields.length > 0 ? (
        <dl className="vin-decode-fields">
          {fields.map(([key, label]) => (
            <div key={key} className="vin-decode-field">
              <dt className="text-caption">{label}</dt>
              <dd className="text-body-sm">{String(decoded[key])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-body-sm text-mute">No decoded details available for this VIN.</p>
      )}
    </div>
  )
}
