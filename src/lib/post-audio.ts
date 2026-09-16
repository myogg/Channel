interface PostAudioLabels {
  idle: string
  loading: string
  pause: string
  resume: string
  share: string
  copied: string
  copyFailed: string
  failed: string
  synthesizing: string
}

interface PostAudioPayload {
  api: string
  token: string
  voice: string
  permalink: string
  chunks: string[]
  labels: PostAudioLabels
  estimated: number
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0))

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Progressive enhancement for the read-aloud bar: the server renders the label,
 * the estimated duration, and the share control, and this module adds playback.
 */
export function initPostAudio(): void {
  const player = document.querySelector<HTMLElement>('.post-audio')
  const payload = player?.dataset.postAudio

  if (!player || !payload)
    return

  const { api, token, voice, permalink, chunks, labels, estimated } = JSON.parse(payload) as PostAudioPayload

  const toggleBtn = player.querySelector<HTMLButtonElement>('.post-audio-toggle')
  const timeEl = player.querySelector<HTMLElement>('.post-audio-time')
  const shareBtn = player.querySelector<HTMLButtonElement>('.post-audio-share')
  const shareLabel = player.querySelector<HTMLElement>('.post-audio-share-label')
  const statusEl = player.querySelector<HTMLElement>('.post-audio-status')

  if (!toggleBtn || !timeEl || !shareBtn || !chunks.length)
    return

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
    timeEl.textContent = audio ? formatTime(offsetOf(index) + audio.currentTime) : formatTime(estimated)
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

  const stop = (): void => {
    abortController?.abort()
    detachAudio()
    playing = false
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

  const handleToggle = (): void => {
    if (loading)
      return

    if (!started) {
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
  updateUI()
}
