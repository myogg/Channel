import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCK_SELECTOR,
  DEFAULT_TTS_API,
  DEFAULT_TTS_TOKEN,
  DEFAULT_TTS_VOICE,
  estimateSpeechSeconds,
  formatSpeechTime,
  getTtsConfig,
  splitSpeechText,
  TTS_CHUNK_LENGTH,
  UNREADABLE_SELECTOR,
} from './tts'

describe('getTtsConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to the public Edge TTS forwarder', () => {
    vi.stubEnv('TTS', undefined)
    vi.stubEnv('TTS_API', undefined)
    vi.stubEnv('TTS_TOKEN', undefined)
    vi.stubEnv('TTS_VOICE', undefined)

    expect(getTtsConfig({})).toEqual({
      api: DEFAULT_TTS_API,
      token: DEFAULT_TTS_TOKEN,
      voice: DEFAULT_TTS_VOICE,
    })
  })

  it.each(['false', '0'])('returns null when TTS is %s', (value) => {
    vi.stubEnv('TTS', value)

    expect(getTtsConfig({})).toBeNull()
  })

  it('stays enabled when TTS is unset', () => {
    vi.stubEnv('TTS', undefined)

    expect(getTtsConfig({})).not.toBeNull()
  })

  it('strips trailing slashes from the api base', () => {
    vi.stubEnv('TTS_API', 'https://tts.example.com//')

    expect(getTtsConfig({})?.api).toBe('https://tts.example.com')
  })

  it('prefers the runtime value over the build-time value', () => {
    vi.stubEnv('TTS_TOKEN', 'runtime-token')

    expect(getTtsConfig({ TTS_TOKEN: 'build-token' })?.token).toBe('runtime-token')
  })
})

describe('speech text selectors', () => {
  // Extraction now runs in the browser, so these guard the rules it relies on.
  it.each([
    'pre',
    'img',
    'video',
    'audio',
    'iframe',
    'button',
    'label',
    '.tgme_widget_message_link_preview',
    '.tgme_widget_message_forwarded_from',
  ])('skips %s when reading aloud', (selector) => {
    expect(UNREADABLE_SELECTOR.split(', ')).toContain(selector)
  })

  it('keeps inline code readable by not skipping code elements', () => {
    expect(UNREADABLE_SELECTOR.split(', ')).not.toContain('code')
  })

  it('separates block boundaries so sentences do not run together', () => {
    for (const selector of ['p', 'div', 'li', 'h1']) {
      expect(BLOCK_SELECTOR.split(', ')).toContain(selector)
    }
  })
})

describe('splitSpeechText', () => {
  it('keeps short text in a single chunk', () => {
    expect(splitSpeechText('短句。')).toEqual(['短句。'])
  })

  it('returns no chunks for blank text', () => {
    expect(splitSpeechText('')).toEqual([])
    expect(splitSpeechText('   ')).toEqual([])
  })

  it('splits on sentence boundaries and stays within the limit', () => {
    const text = '这是一个足够长的句子用来触发切分。'.repeat(40)
    const chunks = splitSpeechText(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks)
      expect(chunk.length).toBeLessThanOrEqual(TTS_CHUNK_LENGTH)

    expect(chunks.join('')).toBe(text)
  })

  it('falls back to a hard cut when no boundary is available', () => {
    const chunks = splitSpeechText('啊'.repeat(TTS_CHUNK_LENGTH * 2))

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(TTS_CHUNK_LENGTH)
  })

  it('honours a custom maximum length', () => {
    expect(splitSpeechText('第一句。第二句。', 4)).toEqual(['第一句。', '第二句。'])
  })
})

describe('estimateSpeechSeconds', () => {
  it('estimates from the joined chunk length', () => {
    expect(estimateSpeechSeconds(['a'.repeat(48)])).toBe(10)
  })

  it('estimates nothing for no chunks', () => {
    expect(estimateSpeechSeconds([])).toBe(0)
  })
})

describe('formatSpeechTime', () => {
  it.each([
    [0, '0:00'],
    [37, '0:37'],
    [217, '3:37'],
    [3600, '60:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatSpeechTime(seconds)).toBe(expected)
  })

  it('clamps negative and missing values', () => {
    expect(formatSpeechTime(-5)).toBe('0:00')
    expect(formatSpeechTime(Number.NaN)).toBe('0:00')
  })
})
