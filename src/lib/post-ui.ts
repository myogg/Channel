import type { Reaction } from '../types'

export const paidReactionClass = 'reaction-paid'

export interface PostTimeParts {
  month: string
  day: string
  year: string
}

function formatDateParts(date: Date, timezone: string | undefined): PostTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value ?? ''
  const month = parts.find(p => p.type === 'month')?.value ?? ''
  const day = parts.find(p => p.type === 'day')?.value ?? ''

  return { month, day, year }
}

export function formatPostTime(datetime: string, timezone?: string, _locale?: string): PostTimeParts {
  const postTime = new Date(datetime)
  return formatDateParts(postTime, timezone)
}

export function getTagHref(tag: string): string {
  return `/search/result?q=${encodeURIComponent(`#${tag}`)}`
}

export function getReactionLabel(reaction: Reaction): string {
  const reactionName = reaction.isPaid ? 'Paid reaction' : `${reaction.emoji || 'Custom emoji'} reaction`

  return `${reactionName}, count ${reaction.count}`
}
