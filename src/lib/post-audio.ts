import { BLOCK_SELECTOR, estimateSpeechSeconds, formatSpeechTime, splitSpeechText, UNREADABLE_SELECTOR } from './tts'

/** Shared with the server-rendered markup so both render the same words. */
export const POST_AUDIO_LABELS = {
  idle: '聆听文章',
  loading: '加载中',
  pause: '暂停朗读',
  resume: '继续播放',
  share: '分享',
  copied: '已复制链接',
  copyFailed: '复制失败',
  failed: '语音合成失败，请稍后重试',
  synthesizing: '正在合成第 {index}/{total} 段',
}

interface PostAudioConfig {
  api: string
  token: string
  voice: string
  permalink: string
}

/** Only one post reads at a time, so starting one stops whatever was playing. */
let stopActive: (() => void) | null = null

/**
 * Reads the rendered post body instead of shipping a second copy of the text
 * in the page, which matters on a feed that repeats the whole channel.
 */
function readableText(root: Element): string {
  const clone = root.cloneNode(true) as Element

  for (const node of clone.querySelectorAll(UNREADABLE_SELECTOR))
    node.remove()

  for (const a of clone.querySelectorAll('a')) {
    if (/^https?:\/\/\S+$/.test(a.textContent?.trim() || ''))
      a.remove()
  }

  for (const br of clone.querySelectorAll('br'))
    br.replaceWith('\n')

  for (const block of clone.querySelectorAll(BLOCK_SELECTOR))
    block.append('\n')

  return (clone.textContent || '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function initPostAudio(): void {
  for (const player of document.querySelectorAll<HTMLElement>('.post-audio'))
    initPlayer(player)
}

function initPlayer(player: HTMLElement): void {
  const payload = player.dataset.postAudio
  const content = player.closest('.post-entry')?.querySelector<HTMLElement>('.post-content')
  const toggleBtn = player.querySelector<HTMLButtonElement>('.post-audio-toggle')
  const timeEl = player.querySelector<HTMLElement>('.post-audio-time')
  const shareBtn = player.querySelector<HTMLButtonElement>('.post-audio-share')
  const shareLabel = player.querySelector<HTMLElement>('.post-audio-share-label')
  const statusEl = player.querySelector<HTMLElement>('.post-audio-status')

  if (!payload || !content || !toggleBtn || !timeEl || !shareBtn) {
    player.hidden = true
    return
  }

  const labels = POST_AUDIO_LABELS
  const chunks = splitSpeechText(readableText(content))

  if (!chunks.length) {
    player.hidden = true
    return
  }

  const { api, token, voice, permalink } = JSON.parse(payload) as PostAudioConfig
  const estimated = estimateSpeechSeconds(chunks)
  const blobs = new Map<number, Blob>()
  const durations: number[] = []
  let index = 0
  let audio: HTMLAudioElement | null = null
  let playing = false
  let loading = false
  let started = false
  let abortController: AbortController | null = null

  const offsetOf = (i: number): number => {
    let sum = 0
    for (let k = 0; k < i; k++)
      sum += durations[k] || 0

    return sum
  }

  const setStatus = (text: string): void => {
    if (!statusEl)
      return

    statusEl.textContent = text
    statusEl.hidden = !text
  }

  const showIcon = (state: string): void => {
    for (const icon of player.querySelectorAll('[data-audio-icon]'))
      icon.toggleAttribute('hidden', icon.getAttribute('data-audio-icon') !== state)
  }

  const renderTime = (): void => {
    timeEl.textContent = audio ? formatSpeechTime(offsetOf(index) + audio.currentTime) : formatSpeechTime(estimated)
  }

  const updateUI = (): void => {
    showIcon(loading ? 'loading' : playing ? 'pause' : 'play')
    const label = loading ? labels.loading : playing ? labels.pause : started ? labels.resume : labels.idle
    toggleBtn.setAttribute('aria-label', label)
    toggleBtn.setAttribute('aria-pressed', String(playing))
  }

  const detachAudio = (): void => {
    if (!audio)
      return

    audio.pause()
    if (audio.dataset.url)
      URL.revokeObjectURL(audio.dataset.url)

    audio = null
  }

  const reset = (): void => {
    detachAudio()
    playing = false
    loading = false
    started = false
    index = 0
    renderTime()
    updateUI()
  }

  const stop = (): void => {
    abortController?.abort()
    detachAudio()
    playing = false
    updateUI()
  }

  const getBlob = async (i: number): Promise<Blob> => {
    const cached = blobs.get(i)
    if (cached)
      return cached

    const params = new URLSearchParams({ text: chunks[i], voiceName: voice, token })
    const res = await fetch(`${api}/api/synthesis?${params}`, { signal: abortController?.signal })
    if (!res.ok)
      throw new Error('TTS request failed')

    const blob = await res.blob()
    blobs.set(i, blob)

    return blob
  }

  const prefetch = (i: number): void => {
    if (i < 0 || i >= chunks.length || blobs.has(i))
      return

    getBlob(i).catch(() => {})
  }

  const playFrom = async (i: number): Promise<void> => {
    if (i >= chunks.length) {
      reset()
      return
    }

    detachAudio()
    index = Math.max(0, i)
    loading = true
    updateUI()
    setStatus(labels.synthesizing.replace('{index}', String(index + 1)).replace('{total}', String(chunks.length)))

    let blob: Blob
    try {
      blob = await getBlob(index)
    }
    catch {
      if (abortController?.signal.aborted)
        return

      loading = false
      playing = false
      updateUI()
      setStatus(labels.failed)
      return
    }

    loading = false
    setStatus('')

    const url = URL.createObjectURL(blob)
    const el = new Audio(url)
    el.dataset.url = url
    audio = el

    el.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(el.duration))
        durations[index] = el.duration

      renderTime()
    })
    el.addEventListener('timeupdate', renderTime)
    el.addEventListener('ended', () => playFrom(index + 1))
    el.addEventListener('error', () => playFrom(index + 1))

    try {
      await el.play()
      playing = true
      started = true
    }
    catch {
      playing = false
    }

    updateUI()
    prefetch(index + 1)
  }

  const claimPlayback = (): void => {
    if (stopActive && stopActive !== stop)
      stopActive()

    stopActive = stop
  }

  const handleToggle = (): void => {
    if (loading)
      return

    if (!started) {
      claimPlayback()
      abortController = new AbortController()
      durations.length = 0
      blobs.clear()
      playFrom(0)
      return
    }

    if (!audio)
      return

    if (playing) {
      audio.pause()
      playing = false
    }
    else {
      claimPlayback()
      audio.play()
      playing = true
    }

    updateUI()
  }

  let shareTimer: ReturnType<typeof setTimeout> | undefined
  const flashShare = (text: string): void => {
    if (!shareLabel)
      return

    shareLabel.textContent = text
    clearTimeout(shareTimer)
    shareTimer = setTimeout(() => {
      shareLabel.textContent = labels.share
    }, 2000)
  }

  const handleShare = async (): Promise<void> => {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url: permalink })
      }
      catch {
        // The reader dismissed the share sheet.
      }
      return
    }

    try {
      await navigator.clipboard.writeText(permalink)
      flashShare(labels.copied)
    }
    catch {
      flashShare(labels.copyFailed)
    }
  }

  toggleBtn.addEventListener('click', handleToggle)
  shareBtn.addEventListener('click', handleShare)
  window.addEventListener('beforeunload', stop)
  renderTime()
  updateUI()
}
