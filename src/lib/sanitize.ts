import DOMPurify from 'dompurify'

// eslint-disable-next-line no-control-regex
const urlControls = /[\x00-\x1F\x7F-\x9F]/
// Preserve tabs and line endings in multiline text.
// eslint-disable-next-line no-control-regex
const textControls = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g

export function sanitizeUrl(value: string): string {
  if (urlControls.test(value)) return ''
  const candidate = value.trim()
  const authority = /^https?:\/\/([^/\\?#]+)/i.exec(candidate)?.[1]
  if (!authority || authority.includes('@') || candidate.includes('\\')) return ''

  try {
    const url = new URL(candidate)
    return url.username || url.password ? '' : url.href
  } catch {
    return ''
  }
}

export function sanitizeText(value: string): string {
  const text = value.replace(textControls, '')
  const cleaned = DOMPurify.isSupported
    ? DOMPurify.sanitize(text, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
        RETURN_DOM_FRAGMENT: true,
      }).textContent ?? ''
    : text.replace(/<[^>]*>/g, '').replace(/[<>]/g, '')
  return cleaned.replace(textControls, '').trim()
}

export function sanitizeHtml(value: string): string {
  const text = value.replace(textControls, '')
  if (!DOMPurify.isSupported) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', '#text'],
    ALLOWED_ATTR: [],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: false,
  })
}

export function sanitizeTagName(value: string): string {
  return sanitizeText(value)
    .replace(/[<>"'`]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 50)
}

export function parseTagNames(raw: string): string[] {
  return raw
    .split(',')
    .reduce<string[]>((tags, value) => {
      const tag = sanitizeTagName(value.replace(/^#/, ''))
      if (tag.length > 0 && tag.length <= 50) tags.push(tag)
      return tags
    }, [])
    .slice(0, 10)
}
