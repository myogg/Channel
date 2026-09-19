/**
 * Image lightbox navigation for posts with multiple images.
 * Adds prev/next arrows, keyboard navigation, and touch swipe support
 * on top of the existing per-image popover modals.
 */

export function initImageLightbox(): void {
  for (const container of document.querySelectorAll<HTMLElement>('.image-list-container')) {
    initContainer(container)
  }
}

function initContainer(container: HTMLElement): void {
  const modals = Array.from(container.querySelectorAll<HTMLElement>('.modal'))
  if (modals.length <= 1)
    return

  let currentIndex = 0

  for (const modal of modals) {
    const img = modal.querySelector<HTMLImageElement>('.modal-img')
    if (img) {
      modal.dataset.lightboxOriginal = JSON.stringify({
        src: img.src,
        alt: img.alt,
      })
    }
  }

  const restoreOriginal = (modal: HTMLElement) => {
    const img = modal.querySelector<HTMLImageElement>('.modal-img')
    const raw = modal.dataset.lightboxOriginal
    if (img && raw) {
      try {
        const data = JSON.parse(raw) as { src: string, alt: string }
        img.src = data.src
        img.alt = data.alt
      }
      catch {}
    }
  }

  const updateCounter = (modal: HTMLElement) => {
    const el = modal.querySelector<HTMLElement>('.lightbox-counter')
    if (el)
      el.textContent = `${currentIndex + 1} / ${modals.length}`
  }

  const showImage = (targetIndex: number) => {
    const currentModal = modals[currentIndex]
    const targetModal = modals[targetIndex]

    currentModal.hidePopover()
    restoreOriginal(currentModal)

    restoreOriginal(targetModal)
    targetModal.showPopover()
    currentIndex = targetIndex
    updateCounter(targetModal)
  }

  const goNext = () => showImage((currentIndex + 1) % modals.length)
  const goPrev = () => showImage((currentIndex - 1 + modals.length) % modals.length)

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goPrev()
    }
    else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goNext()
    }
  }

  let touchStartX = 0
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX
  }
  const handleTouchEnd = (e: TouchEvent) => {
    const diff = touchStartX - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev()
    }
  }

  for (const [i, modal] of modals.entries()) {
    const prevBtn = document.createElement('button')
    prevBtn.type = 'button'
    prevBtn.className = 'lightbox-nav lightbox-prev'
    prevBtn.textContent = '\u2039'
    prevBtn.setAttribute('aria-label', 'Previous image')

    const nextBtn = document.createElement('button')
    nextBtn.type = 'button'
    nextBtn.className = 'lightbox-nav lightbox-next'
    nextBtn.textContent = '\u203A'
    nextBtn.setAttribute('aria-label', 'Next image')

    const counter = document.createElement('div')
    counter.className = 'lightbox-counter'

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      goPrev()
    })
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      goNext()
    })

    modal.appendChild(prevBtn)
    modal.appendChild(nextBtn)
    modal.appendChild(counter)

    modal.addEventListener('toggle', (e: Event) => {
      const te = e as { newState?: string }
      if (te.newState === 'open') {
        currentIndex = i
        restoreOriginal(modal)
        updateCounter(modal)
        document.addEventListener('keydown', handleKeydown)
        modal.addEventListener('touchstart', handleTouchStart, { passive: true })
        modal.addEventListener('touchend', handleTouchEnd, { passive: true })
      }
      else {
        restoreOriginal(modal)
        document.removeEventListener('keydown', handleKeydown)
        modal.removeEventListener('touchstart', handleTouchStart)
        modal.removeEventListener('touchend', handleTouchEnd)
      }
    })
  }
}
