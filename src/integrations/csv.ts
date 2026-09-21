// Pure RFC-4180-ish CSV parser. No file/network I/O — takes raw text (as
// read from a File/input by the caller) and returns rows of string cells.
// Handles quoted fields, escaped quotes (""), commas/newlines inside
// quotes, CRLF and LF line endings, a leading BOM, a trailing newline, and
// skips blank lines.

const BOM = '﻿'

export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let rowHasContent = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
    rowHasContent = false
  }

  let i = 0
  const len = source.length
  while (i < len) {
    const ch = source[i]

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"' && field === '') {
      inQuotes = true
      rowHasContent = true
      i += 1
      continue
    }

    if (ch === ',') {
      endField()
      rowHasContent = true
      i += 1
      continue
    }

    if (ch === '\r') {
      if (source[i + 1] === '\n') i += 1
      endRow()
      i += 1
      continue
    }

    if (ch === '\n') {
      endRow()
      i += 1
      continue
    }

    field += ch
    rowHasContent = true
    i += 1
  }

  if (inQuotes) {
    throw new Error('Unterminated quoted field in CSV.')
  }

  if (field !== '' || rowHasContent) {
    endRow()
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}
