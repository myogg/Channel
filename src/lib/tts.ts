import { getBooleanEnv, getEnv } from './env'

type Env = Record<string, string | undefined>

export const DEFAULT_TTS_API = 'https://read-tts.xxjss-c4e.workers.dev'
export const DEFAULT_TTS_TOKEN = 'tts100412'
export const DEFAULT_TTS_VOICE = 'zh-CN-XiaoxiaoNeural'

/** Keeps every synthesis request inside the forwarder's practical text limit. */
export const TTS_CHUNK_LENGTH = 300

/** Edge TTS reads zh-CN-XiaoxiaoNeural at roughly this pace. */
const CHARS_PER_SECOND = 4.8

/**
 * Read-aloud skips everything that is not sentence text: block code, media,
 * embed players, spoiler controls, and link preview cards. Shared with the
 * browser-side extractor so the feed and the post page read the same words.
 */
export const UNREADABLE_SELECTOR = [
  'pre',
  'iframe',
  'svg',
  'img',
  'video',
  'audio',
  'source',
  'button',
  'input',
  'label',
  '.tgme_widget_message_link_preview',
  '.tgme_widget_message_forwarded_from',
].join(', ')

/** Text node extraction concatenates siblings, so blocks need a separator. */
export const BLOCK_SELECTOR = 'p, div, section, article, blockquote, li, tr, figcaption, h1, h2, h3, h4, h5, h6'

export interface TtsConfig {
  api: string
  token: string
  voice: string
}

/**
 * Read-aloud stays on unless `TTS` is explicitly false, so the defaults target
 * the public Edge TTS forwarder.
 */
export function getTtsConfig(env: Env): TtsConfig | null {
  if (getBooleanEnv(env, 'TTS') === false)
    return null

  return {
    api: (getEnv(env, 'TTS_API') || DEFAULT_TTS_API).replace(/\/+$/, ''),
    token: getEnv(env, 'TTS_TOKEN') || DEFAULT_TTS_TOKEN,
    voice: getEnv(env, 'TTS_VOICE') || DEFAULT_TTS_VOICE,
  }
}

/**
 * Splits sentence text into synthesis-sized chunks, preferring sentence and
 * paragraph boundaries so each request plays back as a natural utterance.
 */
export function splitSpeechText(text: string, maxLength = TTS_CHUNK_LENGTH): string[] {
  const chunks: string[] = []
  let head = text

  while (head.length > maxLength) {
    const window = head.slice(0, maxLength)
    const stop = Math.max(
      window.lastIndexOf('。'),
      window.lastIndexOf('！'),
      window.lastIndexOf('？'),
      window.lastIndexOf('；'),
      window.lastIndexOf('\n'),
    )
    const cut = stop > maxLength * 0.4 ? stop + 1 : maxLength
    chunks.push(head.slice(0, cut).trim())
    head = head.slice(cut).trim()
  }

  const tail = head.trim()
  if (tail)
    chunks.push(tail)

  return chunks.filter(Boolean)
}

/** Chunk length is unknown until its audio arrives, so show an estimate. */
export function estimateSpeechSeconds(chunks: string[]): number {
  return chunks.join(' ').length / CHARS_PER_SECOND
}

export function formatSpeechTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0))

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
