import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPostTime, paidReactionClass } from './post-ui'

describe('post UI helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-10T03:04:05.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats post time as date parts with English month', () => {
    expect(formatPostTime('2020-01-10T02:04:05.000Z', 'UTC', 'en')).toEqual({
      month: 'January',
      day: '10',
      year: '2020',
    })
  })

  it('formats older post time with timezone-aware date parts', () => {
    expect(formatPostTime('2020-01-02T03:04:05.000Z', 'America/New_York', 'en')).toEqual({
      month: 'January',
      day: '1',
      year: '2020',
    })
  })

  it('falls back to english for invalid locales', () => {
    expect(formatPostTime('2020-01-02T03:04:05.000Z', 'UTC', 'unknown-locale')).toEqual({
      month: 'January',
      day: '2',
      year: '2020',
    })
  })

  it('exposes a stable semantic class for paid reactions', () => {
    expect(paidReactionClass).toBe('reaction-paid')
  })
})
