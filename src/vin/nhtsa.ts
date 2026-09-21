export interface DecodedVin {
  make?: string
  model?: string
  year?: number
  trim?: string
  bodyClass?: string
  vehicleType?: string
  manufacturer?: string
  plantCountry?: string
  engine?: string
  fuel?: string
  errorCode: string
  errorText?: string
}

interface NhtsaResponse {
  Count: number
  Message: string
  SearchCriteria: string
  Results: Array<{
    Make: string
    Model: string
    ModelYear: string
    Trim: string
    BodyClass: string
    VehicleType: string
    Manufacturer: string
    PlantCountry: string
    EngineCylinders: string
    DisplacementL: string
    FuelTypePrimary: string
    ErrorCode: string
    ErrorText: string
    [key: string]: string
  }>
}

// vPIC API returns "" for unknown fields
function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value : undefined
}

function formatEngine(
  displacementL: string | undefined,
  engineCylinders: string | undefined
): string | undefined {
  const displacementStr = emptyToUndefined(displacementL)
  const cylinders = emptyToUndefined(engineCylinders)

  let displacement: string | undefined
  if (displacementStr) {
    const num = parseFloat(displacementStr)
    if (Number.isFinite(num)) {
      displacement = num.toFixed(1)
    }
  }

  if (displacement && cylinders) {
    return `${displacement}L ${cylinders}-cyl`
  }

  if (displacement) {
    return `${displacement}L`
  }

  if (cylinders) {
    return `${cylinders}-cyl`
  }

  return undefined
}

export async function decodeVin(
  vin: string,
  fetchImpl: typeof fetch = fetch
): Promise<DecodedVin> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
    vin
  )}?format=json`

  const response = await fetchImpl(url)

  if (!response.ok) {
    throw new Error(
      `NHTSA API returned status ${response.status}: ${response.statusText}`
    )
  }

  const data: NhtsaResponse = await response.json()

  if (!data.Results || data.Results.length === 0) {
    throw new Error('No results returned from NHTSA API for this VIN')
  }

  const result = data.Results[0]

  const modelYear = emptyToUndefined(result.ModelYear)
  let year: number | undefined
  if (modelYear) {
    const parsedYear = parseInt(modelYear, 10)
    if (Number.isFinite(parsedYear)) {
      year = parsedYear
    }
  }

  return {
    make: emptyToUndefined(result.Make),
    model: emptyToUndefined(result.Model),
    year,
    trim: emptyToUndefined(result.Trim),
    bodyClass: emptyToUndefined(result.BodyClass),
    vehicleType: emptyToUndefined(result.VehicleType),
    manufacturer: emptyToUndefined(result.Manufacturer),
    plantCountry: emptyToUndefined(result.PlantCountry),
    engine: formatEngine(result.DisplacementL, result.EngineCylinders),
    fuel: emptyToUndefined(result.FuelTypePrimary),
    errorCode: result.ErrorCode || '',
    errorText: emptyToUndefined(result.ErrorText),
  }
}
