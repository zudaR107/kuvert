// Minimal RFC 4180-ish CSV parser: handles quoted fields (including
// embedded commas and newlines) and escaped quotes (""). No external
// dependency for a format this small and well-specified.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let state: 'unquoted' | 'quoted' | 'after-quote' = 'unquoted'

  function finishField() {
    row.push(field)
    field = ''
    state = 'unquoted'
  }

  function finishRow() {
    finishField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          state = 'after-quote'
        }
      } else {
        field += ch
      }
      continue
    }

    if (state === 'after-quote') {
      if (ch === ',') {
        finishField()
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        finishRow()
      } else {
        throw new Error('Invalid CSV quote grammar')
      }
      continue
    }

    if (ch === '"') {
      if (field !== '') throw new Error('Invalid CSV quote grammar')
      state = 'quoted'
    } else if (ch === ',') {
      finishField()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      finishRow()
    } else {
      field += ch
    }
  }

  if (state === 'quoted') throw new Error('Unterminated quoted CSV field')

  if (field !== '' || row.length > 0 || state === 'after-quote') {
    finishField()
    rows.push(row)
  }

  return rows
}
