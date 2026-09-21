import { describe, it, expect, vi } from 'vitest'
import { decodeVin } from './nhtsa.ts'

describe('decodeVin', () => {
  it('should decode a VIN with full vehicle information', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:1G1YY22G965118816',
            Results: [
              {
                Make: 'Chevrolet',
                Model: 'Corvette',
                ModelYear: '2006',
                Trim: 'Base',
                BodyClass: 'Convertible',
                VehicleType: 'Passenger Car',
                Manufacturer: 'General Motors',
                PlantCountry: 'United States',
                EngineCylinders: '8',
                DisplacementL: '6.0',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('1G1YY22G965118816', mockFetch)

    expect(result).toEqual({
      make: 'Chevrolet',
      model: 'Corvette',
      year: 2006,
      trim: 'Base',
      bodyClass: 'Convertible',
      vehicleType: 'Passenger Car',
      manufacturer: 'General Motors',
      plantCountry: 'United States',
      engine: '6.0L 8-cyl',
      fuel: 'Gasoline',
      errorCode: '0',
      errorText: undefined,
    })
  })

  it('should convert empty strings to undefined', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST123456789000',
            Results: [
              {
                Make: 'Toyota',
                Model: '',
                ModelYear: '2020',
                Trim: '',
                BodyClass: 'Sedan',
                VehicleType: '',
                Manufacturer: 'Toyota',
                PlantCountry: 'Japan',
                EngineCylinders: '',
                DisplacementL: '',
                FuelTypePrimary: 'Hybrid',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST123456789000', mockFetch)

    expect(result.model).toBeUndefined()
    expect(result.trim).toBeUndefined()
    expect(result.vehicleType).toBeUndefined()
    expect(result.engine).toBeUndefined()
    expect(result.errorText).toBeUndefined()
  })

  it('should format engine with both displacement and cylinders', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Ford',
                Model: 'F-150',
                ModelYear: '2022',
                Trim: 'XLT',
                BodyClass: 'Truck',
                VehicleType: 'Pickup',
                Manufacturer: 'Ford',
                PlantCountry: 'United States',
                EngineCylinders: '6',
                DisplacementL: '3.5',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.engine).toBe('3.5L 6-cyl')
  })

  it('should format engine with only displacement', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Ford',
                Model: 'F-150',
                ModelYear: '2022',
                Trim: 'XLT',
                BodyClass: 'Truck',
                VehicleType: 'Pickup',
                Manufacturer: 'Ford',
                PlantCountry: 'United States',
                EngineCylinders: '',
                DisplacementL: '2.4',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.engine).toBe('2.4L')
  })

  it('should format engine with only cylinders', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Ford',
                Model: 'F-150',
                ModelYear: '2022',
                Trim: 'XLT',
                BodyClass: 'Truck',
                VehicleType: 'Pickup',
                Manufacturer: 'Ford',
                PlantCountry: 'United States',
                EngineCylinders: '4',
                DisplacementL: '',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.engine).toBe('4-cyl')
  })

  it('should handle rounding displacement to 1 decimal place', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Ford',
                Model: 'Mustang',
                ModelYear: '2021',
                Trim: 'EcoBoost',
                BodyClass: 'Coupe',
                VehicleType: 'Passenger Car',
                Manufacturer: 'Ford',
                PlantCountry: 'United States',
                EngineCylinders: '4',
                DisplacementL: '2.35415',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.engine).toBe('2.4L 4-cyl')
  })

  it('should throw on non-ok HTTP response', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(new Response('Not Found', { status: 404, statusText: 'Not Found' }))
    )

    await expect(decodeVin('INVALIDVIN', mockFetch)).rejects.toThrow(
      'NHTSA API returned status 404: Not Found'
    )
  })

  it('should throw when Results array is empty', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 0,
            Message: 'No results',
            SearchCriteria: 'Vin:INVALID',
            Results: [],
          })
        )
      )
    )

    await expect(decodeVin('INVALID', mockFetch)).rejects.toThrow(
      'No results returned from NHTSA API for this VIN'
    )
  })

  it('should throw when Results is missing', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 0,
            Message: 'No results',
            SearchCriteria: 'Vin:INVALID',
          })
        )
      )
    )

    await expect(decodeVin('INVALID', mockFetch)).rejects.toThrow(
      'No results returned from NHTSA API for this VIN'
    )
  })

  it('should correctly encode VIN in URL', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:1G1YY22G965118816',
            Results: [
              {
                Make: 'Chevrolet',
                Model: 'Corvette',
                ModelYear: '2006',
                Trim: 'Base',
                BodyClass: 'Convertible',
                VehicleType: 'Passenger Car',
                Manufacturer: 'General Motors',
                PlantCountry: 'United States',
                EngineCylinders: '8',
                DisplacementL: '6.0',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    await decodeVin('1G1YY22G965118816', mockFetch)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/1G1YY22G965118816?format=json'
    )
  })

  it('should correctly encode special characters in VIN', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 0,
            Message: 'No results',
            SearchCriteria: 'Vin:TEST%20VIN',
            Results: [],
          })
        )
      )
    )

    try {
      await decodeVin('TEST VIN', mockFetch)
    } catch {
      // Expected to throw due to empty Results
    }

    expect(mockFetch).toHaveBeenCalledWith(
      'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/TEST%20VIN?format=json'
    )
  })

  it('should default errorCode to empty string when missing', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Toyota',
                Model: 'Camry',
                ModelYear: '2020',
                Trim: 'LE',
                BodyClass: 'Sedan',
                VehicleType: 'Passenger Car',
                Manufacturer: 'Toyota',
                PlantCountry: 'Japan',
                EngineCylinders: '4',
                DisplacementL: '2.5',
                FuelTypePrimary: 'Gasoline',
                ErrorText: '',
                // ErrorCode omitted on purpose
              } as never,
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.errorCode).toBe('')
  })

  it('should parse ModelYear as integer', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Honda',
                Model: 'Civic',
                ModelYear: '2023',
                Trim: 'EX',
                BodyClass: 'Sedan',
                VehicleType: 'Passenger Car',
                Manufacturer: 'Honda',
                PlantCountry: 'Japan',
                EngineCylinders: '4',
                DisplacementL: '1.5',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.year).toBe(2023)
    expect(typeof result.year).toBe('number')
  })

  it('should return undefined for year when ModelYear is empty', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Unknown',
                Model: 'Unknown',
                ModelYear: '',
                Trim: '',
                BodyClass: '',
                VehicleType: '',
                Manufacturer: '',
                PlantCountry: '',
                EngineCylinders: '',
                DisplacementL: '',
                FuelTypePrimary: '',
                ErrorCode: '1',
                ErrorText: 'VIN does not decode correctly',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.year).toBeUndefined()
  })

  it('should format displacement with toFixed(1)', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Ford',
                Model: 'Mustang',
                ModelYear: '2021',
                Trim: 'EcoBoost',
                BodyClass: 'Coupe',
                VehicleType: 'Passenger Car',
                Manufacturer: 'Ford',
                PlantCountry: 'United States',
                EngineCylinders: '4',
                DisplacementL: '2.998832712',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.engine).toBe('3.0L 4-cyl')
  })

  it('should ignore non-numeric displacement', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Ford',
                Model: 'F-150',
                ModelYear: '2022',
                Trim: 'XLT',
                BodyClass: 'Truck',
                VehicleType: 'Pickup',
                Manufacturer: 'Ford',
                PlantCountry: 'United States',
                EngineCylinders: '6',
                DisplacementL: 'invalid',
                FuelTypePrimary: 'Gasoline',
                ErrorCode: '0',
                ErrorText: '',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.engine).toBe('6-cyl')
  })

  it('should return undefined for year when ModelYear is non-numeric', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Count: 1,
            Message: 'Results returned successfully',
            SearchCriteria: 'Vin:TEST',
            Results: [
              {
                Make: 'Unknown',
                Model: 'Unknown',
                ModelYear: 'invalid',
                Trim: '',
                BodyClass: '',
                VehicleType: '',
                Manufacturer: '',
                PlantCountry: '',
                EngineCylinders: '',
                DisplacementL: '',
                FuelTypePrimary: '',
                ErrorCode: '1',
                ErrorText: 'VIN does not decode correctly',
              },
            ],
          })
        )
      )
    )

    const result = await decodeVin('TEST', mockFetch)
    expect(result.year).toBeUndefined()
  })
})
