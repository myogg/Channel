import type { APIContext } from 'astro'
import { DEFAULT_TTS_API, DEFAULT_TTS_TOKEN } from '../../lib/tts'

export async function GET(context: APIContext): Promise<Response> {
  const { url } = context

  const ttsApi = process.env.TTS_API || DEFAULT_TTS_API
  const ttsToken = process.env.TTS_TOKEN || DEFAULT_TTS_TOKEN

  const text = url.searchParams.get('text')
  const voiceName = url.searchParams.get('voiceName') || 'zh-CN-XiaoxiaoNeural'

  if (!text) {
    return new Response('Missing text parameter', { status: 400 })
  }

  const params = new URLSearchParams({
    text,
    voiceName,
  })

  if (ttsToken) {
    params.set('token', ttsToken)
  }

  const upstream = `${ttsApi}/api/synthesis?${params}`

  const res = await fetch(upstream)

  if (!res.ok) {
    return new Response('TTS synthesis failed', { status: res.status })
  }

  const audio = await res.arrayBuffer()

  return new Response(audio, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
