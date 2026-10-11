import * as cheerio from 'cheerio'
import { defineCachedFunction } from 'ocache'
import { $fetch } from 'ofetch'

const TELEGRAPH_HOSTS = new Set(['telegra.ph', 'www.telegra.ph', 'graph.org', 'www.graph.org'])

export interface TelegraphArticle {
  url: string
  html: string
  text: string
}

function normalizeTelegraphUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !TELEGRAPH_HOSTS.has(url.hostname.toLowerCase()))
      return null
    if (url.username || url.password || (url.port && url.port !== '443'))
      return null
    return url.href
  }
  catch {
    return null
  }
}

async function fetchTelegraphArticle(url: string): Promise<TelegraphArticle | null> {
  const html = await $fetch<string, 'text'>(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'BroadcastChannel/0.2.0',
    },
    responseType: 'text',
    timeout: 10000,
    retry: 1,
    retryDelay: 100,
  })

  const $ = cheerio.load(html)
  const article = $('.tl_article_content').first()
  if (!article.length)
    return null

  article.find('script, style, iframe, object, embed, form, input, button, noscript').remove()
  article.find('*').each((_, node) => {
    const element = $(node)
    for (const attribute of Object.keys(node.attribs ?? {})) {
      if (/^on/i.test(attribute))
        element.removeAttr(attribute)
    }

    for (const attribute of ['href', 'src', 'poster']) {
      const value = element.attr(attribute)
      if (!value)
        continue

      try {
        const resolved = new URL(value, url)
        if (resolved.protocol === 'https:' || resolved.protocol === 'http:') {
          element.attr(attribute, resolved.href)
        }
        else {
          element.removeAttr(attribute)
        }
      }
      catch {
        element.removeAttr(attribute)
      }
    }
  })

  article.find('img').each((_, node) => {
    const image = $(node)
    image.attr('loading', 'lazy')
    image.removeAttr('srcset').removeAttr('data-src')
  })

  article.find('a').each((_, node) => {
    $(node).attr('target', '_blank').attr('rel', 'noopener noreferrer')
  })

  const articleHtml = article.html()?.trim() ?? ''
  const text = article.text().replace(/\s+/g, ' ').trim()
  if (!articleHtml || !text)
    return null

  return { url, html: articleHtml, text }
}

const loadCachedTelegraphArticle = defineCachedFunction(fetchTelegraphArticle, {
  name: 'telegraph-article',
  maxAge: 6 * 60 * 60,
  swr: false,
  getKey: url => url,
})

export async function getTelegraphArticle(value: string): Promise<TelegraphArticle | null> {
  const url = normalizeTelegraphUrl(value)
  if (!url)
    return null

  try {
    return await loadCachedTelegraphArticle(url)
  }
  catch (error) {
    if (import.meta.env.DEV)
      console.warn('Unable to load Telegraph article', error)
    return null
  }
}
