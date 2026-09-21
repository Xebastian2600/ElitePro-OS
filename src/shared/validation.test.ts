import { describe, expect, it } from 'vitest'
import {
  formatPhone,
  isValidEmail,
  isValidVin,
  normalizeEmail,
  normalizePhone,
  normalizeVin,
  validateCustomerInput,
  validateJobInput,
  validateLeadInput,
  validateLeadStatusChange,
  validateVehicleInput,
} from './validation.ts'

describe('normalizePhone', () => {
  it('normalizes a plain 10-digit US number', () => {
    expect(normalizePhone('5551234567')).toBe('+15551234567')
  })

  it('normalizes formatted US numbers', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567')
    expect(normalizePhone('555.123.4567')).toBe('+15551234567')
    expect(normalizePhone('555 123 4567')).toBe('+15551234567')
  })

  it('normalizes an 11-digit number with a leading 1', () => {
    expect(normalizePhone('15551234567')).toBe('+15551234567')
  })

  it('passes through international numbers with a leading +', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
  })

  it('rejects numbers that are too short', () => {
    expect(normalizePhone('123')).toBeNull()
  })

  it('rejects a + number outside the 8-15 digit range', () => {
    expect(normalizePhone('+1234567')).toBeNull()
    expect(normalizePhone('+1234567890123456')).toBeNull()
  })

  it('rejects an 11-digit number not starting with 1', () => {
    expect(normalizePhone('25551234567')).toBeNull()
  })

  it('treats empty or whitespace input as null', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
})

describe('formatPhone', () => {
  it('formats a US E.164 number for display', () => {
    expect(formatPhone('+15551234567')).toBe('(555) 123-4567')
  })

  it('returns non-US numbers unchanged', () => {
    expect(formatPhone('+442079460958')).toBe('+442079460958')
  })
})

describe('normalizeEmail / isValidEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Example.COM  ')).toBe('foo@example.com')
  })

  it('treats empty input as null', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it('validates basic email shape', () => {
    expect(isValidEmail('foo@example.com')).toBe(true)
    expect(isValidEmail('foo@example')).toBe(false)
    expect(isValidEmail('foo.example.com')).toBe(false)
    expect(isValidEmail('foo @example.com')).toBe(false)
  })
})

describe('normalizeVin / isValidVin', () => {
  const validVin = '1HGCM82633A004352'

  it('uppercases and strips spaces/dashes', () => {
    expect(normalizeVin(' 1hgcm82633a004352 ')).toBe(validVin)
    expect(normalizeVin('1HGCM-82633-A00-4352')).toBe(validVin)
  })

  it('treats empty input as null', () => {
    expect(normalizeVin('')).toBeNull()
    expect(normalizeVin(null)).toBeNull()
  })

  it('accepts a well-formed 17-character VIN', () => {
    expect(isValidVin(validVin)).toBe(true)
  })

  it('rejects VINs containing I, O, or Q', () => {
    expect(isValidVin('1HGCM82633A00435I')).toBe(false)
    expect(isValidVin('1HGCM82633A00435O')).toBe(false)
    expect(isValidVin('1HGCM82633A00435Q')).toBe(false)
  })

  it('rejects VINs of the wrong length', () => {
    expect(isValidVin('1HGCM82633A0043')).toBe(false)
    expect(isValidVin('1HGCM82633A0043522')).toBe(false)
  })
})

describe('validateCustomerInput', () => {
  it('requires a name', () => {
    const result = validateCustomerInput({ name: '  ', phone: '5551234567' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.name).toBeDefined()
  })

  it('requires at least one of phone or email', () => {
    const result = validateCustomerInput({ name: 'Jane Doe' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors._).toBeDefined()
  })

  it('rejects an invalid phone', () => {
    const result = validateCustomerInput({ name: 'Jane Doe', phone: '123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.phone).toBeDefined()
  })

  it('rejects an invalid email', () => {
    const result = validateCustomerInput({ name: 'Jane Doe', email: 'not-an-email' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.email).toBeDefined()
  })

  it('normalizes a valid customer', () => {
    const result = validateCustomerInput({
      name: '  Jane Doe  ',
      phone: '(555) 123-4567',
      email: '  Jane@Example.COM ',
      address: '',
      notes: undefined,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        name: 'Jane Doe',
        phone: '+15551234567',
        email: 'jane@example.com',
        address: null,
        notes: null,
      })
    }
  })
})

describe('validateVehicleInput', () => {
  const validVin = '1HGCM82633A004352'

  it('requires a customer_id', () => {
    const result = validateVehicleInput({ customer_id: '', vin: validVin })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.customer_id).toBeDefined()
  })

  it('requires vin OR year+make+model', () => {
    const result = validateVehicleInput({ customer_id: 'cust-1', make: 'Honda' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors._).toBeDefined()
  })

  it('accepts a vehicle identified only by VIN', () => {
    const result = validateVehicleInput({ customer_id: 'cust-1', vin: validVin })
    expect(result.ok).toBe(true)
  })

  it('accepts a vehicle identified by year+make+model with no VIN', () => {
    const result = validateVehicleInput({ customer_id: 'cust-1', year: 2020, make: 'Honda', model: 'Accord' })
    expect(result.ok).toBe(true)
  })

  it('rejects an out-of-range year', () => {
    const result = validateVehicleInput({ customer_id: 'cust-1', year: 1900, make: 'Honda', model: 'Accord' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.year).toBeDefined()
  })

  it('rejects an invalid VIN', () => {
    const result = validateVehicleInput({ customer_id: 'cust-1', vin: 'NOTAVALIDVIN' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.vin).toBeDefined()
  })

  it('defaults adas_status and verified_status', () => {
    const result = validateVehicleInput({ customer_id: 'cust-1', vin: validVin })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.adas_status).toBe('unknown')
      expect(result.value.verified_status).toBe('unverified')
    }
  })
})

describe('validateLeadInput', () => {
  it('requires a lost_reason when status is lost', () => {
    const result = validateLeadInput({ status: 'lost' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.lost_reason).toBeDefined()
  })

  it('accepts a lost lead with a reason', () => {
    const result = validateLeadInput({ status: 'lost', lost_reason: 'Went with a competitor' })
    expect(result.ok).toBe(true)
  })

  it('requires a customer when a vehicle is set', () => {
    const result = validateLeadInput({ vehicle_id: 'veh-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.vehicle_id).toBeDefined()
  })

  it('rejects an invalid status', () => {
    // @ts-expect-error testing runtime validation of an out-of-union value
    const result = validateLeadInput({ status: 'bogus' })
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid next_action_at date', () => {
    const result = validateLeadInput({ next_action_at: 'not-a-date' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.next_action_at).toBeDefined()
  })
})

describe('validateLeadStatusChange', () => {
  it('requires a reason moving to lost', () => {
    const result = validateLeadStatusChange('lost')
    expect(result.ok).toBe(false)
  })

  it('clears lost_reason for a non-lost status', () => {
    const result = validateLeadStatusChange('booked', 'irrelevant')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.lost_reason).toBeNull()
  })
})

describe('validateJobInput', () => {
  it('requires customer_id and vehicle_id', () => {
    const result = validateJobInput({ customer_id: '', vehicle_id: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.customer_id).toBeDefined()
      expect(result.errors.vehicle_id).toBeDefined()
    }
  })

  it('accepts a well-formed quote_id UUID', () => {
    const result = validateJobInput({
      customer_id: 'cust-1',
      vehicle_id: 'veh-1',
      quote_id: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a malformed quote_id', () => {
    const result = validateJobInput({ customer_id: 'cust-1', vehicle_id: 'veh-1', quote_id: 'not-a-uuid' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.quote_id).toBeDefined()
  })

  it('rejects an invalid appointment_at', () => {
    const result = validateJobInput({ customer_id: 'cust-1', vehicle_id: 'veh-1', appointment_at: 'not-a-date' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.appointment_at).toBeDefined()
  })
})
