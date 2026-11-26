import { defineConfig } from 'vitepress'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const docsRoot = fileURLToPath(new URL('..', import.meta.url))

/** 目录名 -> 侧边栏标题；新增主题时在这里补一行即可 */
const SECTION_TITLES: Record<string, string> = {
  jwt: 'JWT 鉴权',
}

interface Meta {
  title: string
  order: number
}

/** 从 front-matter 的 title/order 取元数据，没有就退回一级标题、文件名 */
function readMeta(file: string): Meta {
  const raw = readFileSync(file, 'utf8')
  const frontMatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const title = frontMatter?.[1]
    .match(/^title:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
  const order = Number(frontMatter?.[1].match(/^order:\s*(\d+)$/m)?.[1] ?? Number.NaN)
  const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return {
    title: title || heading || file.split('/').pop()!.replace(/\.md$/, ''),
    order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
  }
}

/** 一个主题目录下的所有 .md，按 order 排序，index.md 永远第一 */
function section(dir: string) {
  const abs = resolve(docsRoot, dir)
  const files = readdirSync(abs).filter((file) => file.endsWith('.md'))
  return files
    .map((file) => {
      const name = file.replace(/\.md$/, '')
      const meta = readMeta(resolve(abs, file))
      return {
        text: meta.title,
        link: file === 'index.md' ? `/${dir}/` : `/${dir}/${name}`,
        order: file === 'index.md' ? -1 : meta.order,
      }
    })
    .sort((a, b) => a.order - b.order || a.text.localeCompare(b.text, 'zh-CN'))
    .map(({ text, link }) => ({ text, link }))
}

const topics = readdirSync(docsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'public')
  .map((entry) => entry.name)
  .sort()

/**
 * 中文分词：MiniSearch 默认按空格切词，中文没有空格，会整段变成一个 token。
 * 用 Intl.Segmenter 按词切，搜「签名」才能命中「JWT 签名机制」。
 */
function tokenizeZh(text: string): string[] {
  const tokens: string[] = []
  // 按中文/非中文切段，英文数字走普通分词
  for (const part of text.split(/([\u4e00-\u9fff]+)/)) {
    if (!part) continue
    if (!/^[\u4e00-\u9fff]/.test(part)) {
      for (const piece of part.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        if (piece) tokens.push(piece)
      }
      continue
    }
    // 词典分词（如「签名」「机制」）
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
      for (const piece of segmenter.segment(part)) {
        if (piece.isWordLike) tokens.push(piece.segment)
      }
    } else {
      tokens.push(...part)
    }
    // 二元组兜底（词典不认识的词，如「鉴权」）
    for (let i = 0; i + 1 < part.length; i += 1) tokens.push(part.slice(i, i + 2))
  }
  return tokens
}

export default defineConfig({
  lang: 'zh-CN',
  title: '个人 Wiki',
  description: '边学边记，按主题沉淀',
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'JWT', link: '/jwt/' },
    ],
    sidebar: topics.map((dir) => ({
      text: SECTION_TITLES[dir] ?? dir,
      collapsed: false,
      items: section(dir),
    })),
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
        miniSearch: {
          options: {
            tokenize: tokenizeZh,
            processTerm: (term: string) => term.toLowerCase(),
          },
          searchOptions: {
            prefix: true,
            fuzzy: 0.2,
            boost: { title: 4, text: 2 },
          },
        },
      },
    },
  },
})
