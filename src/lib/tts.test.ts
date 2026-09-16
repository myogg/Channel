import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TTS_API,
  DEFAULT_TTS_TOKEN,
  DEFAULT_TTS_VOICE,
  estimateSpeechSeconds,
  formatSpeechTime,
  getSpeechText,
  getTtsConfig,
  splitSpeechText,
  TTS_CHUNK_LENGTH,
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

describe('getSpeechText', () => {
  it('keeps sentence text and drops block code', () => {
    const html = '<p>第一段。</p><pre class="code"><code>const a = 1</code></pre><p>第二段。</p>'

    expect(getSpeechText(html)).toBe('第一段。\n第二段。')
  })

  it('keeps inline code inside its sentence', () => {
    expect(getSpeechText('<p>运行 <code>pnpm dev</code> 即可。</p>')).toBe('运行 pnpm dev 即可。')
  })

  it('drops media, embed players, and interactive controls', () => {
    const html
      = '<p>正文。</p><img src="a.png" alt="图"><video src="b.mp4" controls></video>'
        + '<button popovertarget="x">展开</button><p>结尾。</p>'

    expect(getSpeechText(html)).toBe('正文。\n结尾。')
  })

  it('drops link preview cards and forwarded-source headers', () => {
    const html
      = '<div class="tgme_widget_message_link_preview"><span class="link_preview_title">标题</span></div>'
        + '<div class="tgme_widget_message_forwarded_from">转自 某人</div><p>正文。</p>'

    expect(getSpeechText(html)).toBe('正文。')
  })

  it('separates blocks and collapses whitespace', () => {
    expect(getSpeechText('<p>上</p><p>下</p>')).toBe('上\n下')
    expect(getSpeechText('<p>行一<br>行二</p>')).toBe('行一\n行二')
    expect(getSpeechText('<p>  多个   空格  </p>')).toBe('多个 空格')
  })

  it('decodes entities and treats empty content as nothing to read', () => {
    expect(getSpeechText('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>')
    expect(getSpeechText('')).toBe('')
    expect(getSpeechText('<p>   </p>')).toBe('')
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
