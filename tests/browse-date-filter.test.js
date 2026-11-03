import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { buildIndexWhere } = require_('../electron/db/catalogIndex.js')

// Browse date filter: the slider sets dateRange "custom" with dateFrom/dateTo.
// Both SQL paths (catalog index + union fallback) must produce >= / <= clauses.
// BETWEEN fails when one bound is null (SQLite: BETWEEN x AND NULL is always false).

describe('Browse date filter (custom range)', () => {
  it('custom range with both dates produces >= and <= on release_date_ms', () => {
    const { where, params } = buildIndexWhere({}, {
      dateField: 'releaseDate',
      dateRange: 'custom',
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    })
    expect(where).toContain('ci.release_date_ms >= ?')
    expect(where).toContain('ci.release_date_ms <= ?')
    const fromMs = Date.parse('2024-01-01T00:00:00')
    const toMs = Date.parse('2024-12-31T23:59:59.999')
    expect(params).toContain(fromMs)
    expect(params).toContain(toMs)
  })

  it('custom range with only dateFrom (slider default) produces >= only', () => {
    const { where, params } = buildIndexWhere({}, {
      dateField: 'releaseDate',
      dateRange: 'custom',
      dateFrom: '2024-06-15',
      dateTo: '',
    })
    expect(where).toContain('ci.release_date_ms >= ?')
    expect(where).not.toContain('ci.release_date_ms <= ?')
    const fromMs = Date.parse('2024-06-15T00:00:00')
    expect(params).toContain(fromMs)
  })

  it('custom range with neither date set adds no clause', () => {
    const { where } = buildIndexWhere({}, {
      dateField: 'releaseDate',
      dateRange: 'custom',
      dateFrom: '',
      dateTo: '',
    })
    expect(where).not.toContain('release_date_ms')
  })

  it('preset 7d still produces a >= clause (regression guard)', () => {
    const { where, params } = buildIndexWhere({}, {
      dateField: 'releaseDate',
      dateRange: '7d',
    })
    expect(where).toContain('ci.release_date_ms')
    expect(params.length).toBeGreaterThanOrEqual(1)
  })

  it('dateField none with browseDateRange 30d still works (saved-filter path)', () => {
    const { where } = buildIndexWhere({}, {
      dateField: 'none',
      browseDateRange: '30d',
    })
    expect(where).toContain('thread_updated_ms')
  })
})

describe('versions.js fallback path (text guard)', () => {
  const read = (...parts) =>
    fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

  it('addDateRangeFilter handles custom with separate >= and <= conditions', () => {
    const source = read('electron', 'db', 'versions.js')
    const fnStart = source.indexOf('const addDateRangeFilter')
    const fnEnd = source.indexOf('const browseSource', fnStart)
    const fn = source.slice(fnStart, fnEnd)
    expect(fn).toContain("'custom'")
    // The push statements must use separate >= and <=, not a single BETWEEN
    expect(fn).toContain('>= ?')
    expect(fn).toContain('<= ?')
    expect(fn).not.toContain('BETWEEN ? AND ?')
  })
})
