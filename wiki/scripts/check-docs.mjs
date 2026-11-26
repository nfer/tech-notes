#!/usr/bin/env node
/**
 * 文档检查器：把 AGENTS.md 里的写作规则变成可执行的检查。
 * 用法：cd wiki && ./check     （有 error 时退出码 1）
 *
 * error   = 违反硬规则，必须改
 * warning = 需要人工看一眼的疑点
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const DOCS = resolve(import.meta.dirname, '../docs')
const errors = []
const warnings = []

/** 递归收集 markdown 文件 */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (name.startsWith('.') || name === 'public') return []
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.md') ? [full] : []
  })
}

const files = walk(DOCS)
const rel = (f) => relative(DOCS, f)

/** 把文件切成「行 + 是否在配套实验节」的形式 */
function parse(f) {
  const raw = readFileSync(f, 'utf8')
  const lines = raw.split('\n')
  let inExperiment = false
  return lines.map((text, i) => {
    if (/^##\s+配套实验\s*$/.test(text)) inExperiment = true
    else if (inExperiment && /^##\s+/.test(text)) inExperiment = false
    return { text, line: i + 1, inExperiment }
  })
}

const FORBIDDEN = [
  /只需要知道/,
  /不需要记住/,
  /下面这张表/,
  /如我们刚才所说/,
  /如前所述/,
  /以后会讲/,
  /留给\S*展开/,
  /见后续/,
]

const IMPLEMENTATION_ID = /\b(POST|GET|PUT|DELETE|PATCH) \/|`\/[a-z]+\/?`|`[^`\n]*\.mjs`|`[^`\n]*\.mts`/

/** 1. 对话残留 */
for (const f of files) {
  for (const { text, line } of parse(f)) {
    for (const re of FORBIDDEN) {
      if (re.test(text)) errors.push(`${rel(f)}:${line} 对话残留：${text.trim()}`)
    }
  }
}

const TRANSLATIONESE = [
  ['单一事实源', /单一事实源/],
  ['凭证增殖', /凭证增殖/],
  ['事实标准', /事实标准/],
  ['延迟一致性', /延迟一致性/],
  ['不含冲突', /不含冲突/],
  ['应用级状态', /应用级状态/],
  ['认知坑', /认知坑/],
  ['天真实现', /天真实现/],
  ['课程地图', /课程地图/],
  ['学习仓库', /学习仓库/],
  ['深入 + 产物名', /深入笔记|深入实验课/],
]

/** 1b. 翻译腔（AGENTS.md 写作规则 9） */
for (const f of files) {
  for (const { text, line } of parse(f)) {
    for (const [label, re] of TRANSLATIONESE) {
      if (re.test(text)) errors.push(`${rel(f)}:${line} 翻译腔「${label}」：${text.trim()}`)
    }
  }
}

const JARGON = [/沉淀/, /赋能/, /闭环/, /抓手/, /全链路/]

/** 1c. 黑话（提示，人工判断是否必要） */
for (const f of files) {
  for (const { text, line } of parse(f)) {
    for (const re of JARGON) {
      if (re.test(text)) warnings.push(`${rel(f)}:${line} 疑似黑话，确认是否必要：${text.trim()}`)
    }
  }
}

/** 2. 正文不写实现标识（配套实验节内允许） */
for (const f of files) {
  for (const { text, line, inExperiment } of parse(f)) {
    if (inExperiment) continue
    if (isExempt(f, text)) continue
    if (IMPLEMENTATION_ID.test(text)) errors.push(`${rel(f)}:${line} 正文出现实现标识：${text.trim()}`)
  }
}
/** 豁免：使用说明页本身在教读者改配置；句子自带「配套实验」「对应实验」出处的引述 */
function isExempt(file, text) {
  if (rel(file) === 'guide.md') return true
  if (/^(配套实验|对应实验)/.test(text.trim())) return true
  if (/（对应实验/.test(text)) return true
  return false
}

/** 3. 链接可达 */
for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  for (const m of raw.matchAll(/\]\((\/[^)#\s]+)(#[^)]*)?\)/g)) {
    const path = m[1]
    const target = path.endsWith('/')
      ? join(DOCS, path.slice(1), 'index.md')
      : join(DOCS, `${path.slice(1)}.md`)
    if (!existsSync(target)) errors.push(`${rel(f)} 死链：${path}`)
  }
}

/** 4. 表格：注解一致性与空列 */
for (const f of files) {
  const rows = parse(f).filter(({ text }) => text.trim().startsWith('|'))
  const tables = rows.filter(({ text }, i) => i === 0 || !rows[i - 1])
  let block = []
  const blocks = []
  for (const r of parse(f)) {
    if (r.text.trim().startsWith('|')) block.push(r)
    else if (block.length) {
      blocks.push(block)
      block = []
    }
  }
  if (block.length) blocks.push(block)

  for (const b of blocks) {
    const data = b.filter((r) => !/^\|\s*(?:-+|:|-+:)\s*\|/.test(r.text.trim()) && !/\|\s*-+\s*\|/.test(r.text.trim()))
    if (data.length < 2) continue
    const header = data[0]
    const body = data.slice(1)
    const cols = body[0].text.trim().replace(/^\||\|$/g, '').split('|').length

    // 注解不一致：同列有的带「（…）」有的不带
    for (let c = 0; c < cols; c += 1) {
      const cells = body.map((r) => r.text.trim().replace(/^\||\|$/g, '').split('|')[c] ?? '')
      const annotated = cells.filter((cell) => /（(?:如|例如|比如|即)[^）]*）|（[^）]*`[^）]*）/.test(cell))
      if (annotated.length > 0 && annotated.length < cells.length) {
        warnings.push(
          `${rel(f)}:${body[0].line} 第 ${c + 1} 列注解不一致（${annotated.length}/${cells.length} 格带括号说明）`,
        )
      }
      // 空列：所有值相同，说明没有区分度
      const uniq = new Set(cells.map((cell) => cell.trim()))
      if (uniq.size === 1 && cells.length > 1) {
        warnings.push(`${rel(f)}:${body[0].line} 第 ${c + 1} 列全部是「${cells[0].trim()}」，没有区分度`)
      }
    }
  }
}

/** 5. 章节顺序：配套实验 → 常见误区 → 自测 */
for (const f of files) {
  const heads = parse(f).filter(({ text }) => /^##\s+/.test(text)).map(({ text, line }) => ({
    name: text.replace(/^##\s+/, '').trim(),
    line,
  }))
  const idx = (name) => heads.findIndex((h) => h.name === name)
  const pairs = [
    ['配套实验', '常见误区'],
    ['常见误区', '自测'],
  ]
  for (const [a, bb] of pairs) {
    const ia = idx(a)
    const ib = idx(bb)
    if (ia !== -1 && ib !== -1 && ia > ib) {
      errors.push(`${rel(f)} 章节顺序：「${a}」应在「${bb}」之前`)
    }
  }
}

/** 6. 单次出现的行内术语（可能未解释，人工判断） */
const seen = new Map()
for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  for (const m of raw.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim()
    if (!token || /^[\s\p{P}\d$+-]+$/u.test(token)) continue
    if (/[\s/{}()=<>+."]/.test(token)) continue
    if (/^(?:HS|RS|ES|PS)\d{3}$/.test(token)) continue
    if (/^[A-Z0-9_-]+$/.test(token)) continue
    if (['input', 'admin', 'tenant', 'bearer', 'jwt', 'error', 'header', 'payload', 'signature', 'raw'].includes(token)) continue
    if (!seen.has(token)) seen.set(token, [])
    seen.get(token).push(rel(f))
  }
}
for (const [token, where] of seen) {
  if (where.length === 1) warnings.push(`术语只出现一次（确认是否已解释）：\`${token}\` — ${where[0]}`)
}

/** 输出 */
for (const e of errors) console.log(`✗ ${e}`)
for (const w of warnings) console.log(`! ${w}`)
console.log(`\n检查完成：${files.length} 个文件，${errors.length} 个错误，${warnings.length} 个提示`)
process.exit(errors.length === 0 ? 0 : 1)
