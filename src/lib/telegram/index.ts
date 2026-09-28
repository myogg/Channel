import type { ChannelInfo, GetChannelInfoParams, Post } from '../../types'
import { modifyHTMLContent } from './content'
import { extractPost } from './parse'
import { loadChannelDocument } from './request'
import { normalizeUrlAttribute } from './url'

export function isRenderablePost(post: Post | null | undefined): post is Post {
  return Boolean(post?.id && post.type === 'text' && post.content)
}

export async function getChannelPost(id: string): Promise<Post | null> {
  const { $, channel, telegramHost, staticProxy, reactionsEnabled } = await loadChannelDocument({ id })
  const post = await extractPost($, null, { channel, telegramHost, staticProxy, reactionsEnabled })

  return isRenderablePost(post) ? post : null
}

export async function getChannelInfo(params: GetChannelInfoParams = {}): Promise<ChannelInfo> {
  const { before = '', after = '', q = '' } = params
  const { $, channel, telegramHost, staticProxy, reactionsEnabled } = await loadChannelDocument({ before, after, q })
  const postNodes = $('.tgme_channel_history .tgme_widget_message_wrap').toArray()
  const avatar = $('.tgme_page_photo_image img').attr('src')
  const posts = (await Promise.all(
    postNodes.map((item, index) => extractPost($, item, { channel, telegramHost, staticProxy, index, reactionsEnabled })),
  ))
    .reverse()
    .filter(isRenderablePost)

  const channelInfo: ChannelInfo = {
    posts,
    title: $('.tgme_channel_info_header_title').text(),
    description: $('.tgme_channel_info_description').text(),
    descriptionHTML: (await modifyHTMLContent($, $('.tgme_channel_info_description'), { telegramHost, staticProxy })).html(),
    avatar: avatar ? normalizeUrlAttribute(avatar) : avatar,
  }

  return channelInfo
}

export async function getAllChannelPosts(maxPages = 20): Promise<Post[]> {
  const allPosts: Post[] = []
  let beforeCursor = ''

  for (let page = 0; page < maxPages; page++) {
    const info = await getChannelInfo({ before: beforeCursor })
    if (info.posts.length === 0)
      break

    allPosts.push(...info.posts)

    const oldestId = info.posts[info.posts.length - 1]?.id
    if (!oldestId || Number(oldestId) <= 1)
      break
    beforeCursor = oldestId
  }

  const seen = new Set<string>()
  return allPosts
    .filter((post) => {
      if (seen.has(post.id))
        return false
      seen.add(post.id)
      return true
    })
    .sort((a, b) => Number(b.id) - Number(a.id))
}
