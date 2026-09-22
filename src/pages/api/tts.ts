import type { APIContext } from 'astro'

export async function GET(context: APIContext): Promise<Response> {
  const { url, env } = context

  const ttsApi = (env.TTS_API as string) || 'https://read-tts.xxjss-c4e.workers.dev'
  const ttsToken = (env.TTS_TOKEN as string) || ''

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
