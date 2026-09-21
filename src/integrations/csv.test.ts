import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.ts'

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields', () => {
    expect(parseCsv('name,note\n"Smith, John","says ""hi"" there"')).toEqual([
      ['name', 'note'],
      ['Smith, John', 'says "hi" there'],
    ])
  })

  it('handles commas inside quoted fields', () => {
    expect(parseCsv('a,b\n"1,2",3')).toEqual([
      ['a', 'b'],
      ['1,2', '3'],
    ])
  })

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('handles plain LF line endings', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('strips a leading BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('ignores a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('throws a clear error on an unterminated quote', () => {
    expect(() => parseCsv('a,b\n"unterminated,2')).toThrow(/unterminated/i)
  })

  it('handles an empty quoted field', () => {
    expect(parseCsv('a,b\n"",2')).toEqual([
      ['a', 'b'],
      ['', '2'],
    ])
  })
})
