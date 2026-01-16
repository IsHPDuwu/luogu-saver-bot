import { Context, Schema, h } from 'koishi'
import { TaskStatus, statusToString } from './task'
import MarkdownIt from 'markdown-it'

export const name = 'luogu-saver-bot'
export const inject = ['puppeteer']

export interface Config {
  endpoint?: string
  userAgent?: string
}

export const Config: Schema<Config> = Schema.object({
  endpoint: Schema.string().description('自定义 API endpoint，结尾无需斜杠').role('input').default(''),
  userAgent: Schema.string().description('自定义 User-Agent').role('input').default('Uptime-Kuma'),
})

// --- 类型定义保持不变 ---
export type Article = {
  id: string
  title: string
  content: string
  authorId: number
  category: number
  upvote?: number
  favorCount?: number
  solutionForPid?: string | null
  priority?: number
  deleted?: number
  tags: string[]
  createdAt?: string
  updatedAt?: string
  deleteReason?: string
  contentHash?: string | null
  viewCount?: number
  renderedContent?: string | null
}

export type StdResponse<A> = {
  code: number
  message: string
  data: A
}

export type ArticleHistory = {
  id: number
  articleId: string
  version: number
  title: string
  content: string
  createdAt: string
}

export type Paste = {
  id: string
  content: string
  authorId: number
  deleted?: number | boolean
  createdAt?: string
  updatedAt?: string
  deleteReason?: string
  renderedContent?: string | null
  author?: {
    id: number
    name: string
    color?: string
    createdAt?: string
    updatedAt?: string
  }
}

export type CountResponse = { count: number }
export type TaskQuery = Record<string, any> | null
export type Task = {
  id: string
  info?: string | null
  status: 0 | 1 | 2 | 3
  createdAt: string
  type: 'save' | 'ai_process'
  target?: string | null
  payload: Record<string, any>
}

export type TaskCreateBase = { type: string; payload: Record<string, any> }
export type TaskCreateSave = TaskCreateBase & { type: 'save'; payload: { target: string; targetId: string; metadata?: Record<string, any> } }
export type TaskCreateAi = TaskCreateBase & { type: 'ai_process'; payload: { target: string; metadata: Record<string, any> } }
export type TaskCreateResponse = { taskId: string }

// --- Client 类保持不变 ---
class LuoguSaverClient {
  constructor(private ctx: Context, public endpoint: string, public userAgent: string) {
    if (!this.endpoint) this.endpoint = ''
  }

  private buildUrl(path: string) {
    const base = this.endpoint.replace(/\/$/, '')
    if (!base) return path
    if (path.startsWith('/')) return `${base}${path}`
    return `${base}/${path}`
  }

  private headers(extra?: Record<string, string>) {
    return Object.assign({ 'User-Agent': this.userAgent }, extra || {})
  }

  async getArticle(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/article/query/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get<StdResponse<Article>>(url, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data
  }

  async getPaste(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/paste/query/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get<StdResponse<Paste>>(url, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data
  }

  async getRecent(opts?: { count?: number; updated_after?: string; truncated_count?: number }, extraHeaders?: Record<string, string>) {
    const params = new URLSearchParams()
    if (opts?.count != null) params.set('count', String(opts.count))
    if (opts?.updated_after) params.set('updated_after', opts.updated_after)
    if (opts?.truncated_count != null) params.set('truncated_count', String(opts.truncated_count))
    const path = `/article/recent${params.toString() ? `?${params.toString()}` : ''}`
    const url = this.buildUrl(path)
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as Article[] | null
  }

  async getCount(extraHeaders?: Record<string, string>) {
    const url = this.buildUrl('/article/count')
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as CountResponse | null
  }

  async getRelevant(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/article/relevant/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as Article[] | null
  }

  async getHistory(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/article/history/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as ArticleHistory[] | null
  }

  async createTask(body: TaskCreateSave | TaskCreateAi, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl('/task/create')
    const res = await this.ctx.http.post<StdResponse<TaskCreateResponse>>(url, body, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data.taskId
  }

  async getTask(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/task/query/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get<StdResponse<TaskQuery>>(url, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data
  }
}

declare module 'koishi' {
  interface Context {
    luogu_saver: LuoguSaverClient
    puppeteer?: any
  }
}

// --- 样式表与模板生成 ---

async function generateHtml(title: string, authorInfo: string, markdownContent: string) {
  const { katex } = await import('@mdit/plugin-katex')

  // --- Markdown 渲染器初始化 ---
  const md = new MarkdownIt({
    html: true,
    breaks: true,
  }).use(katex, {
    allowFunctionInTextMode: true, // 允许在文本模式下使用函数
    strict: false, // 禁用严格模式，防止因不标准语法报错
  });  
  
  const renderedBody = md.render(markdownContent);
    
    // 使用 CDN 引入必要的样式：GitHub Markdown CSS, KaTeX CSS, Highlight.js CSS
    // 同时也包含自定义的美化样式
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/styles/github.min.css">
  
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.css">

  <style>
    /* 基础重置与变量 */
    :root {
      --bg-color: #f6f8fa;
      --card-bg: #ffffff;
      --text-primary: #24292f;
      --text-secondary: #57606a;
      --border-color: #d0d7de;
      --accent-color: #0969da;
    }
    
    body {
      margin: 0;
      padding: 40px;
      background-color: var(--bg-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
      color: var(--text-primary);
      line-height: 1.5;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 32px 40px;
      box-shadow: 0 3px 6px rgba(140, 149, 159, 0.15);
    }

    /* 头部信息 */
    header {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    
    h1.title {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 600;
    }

    .meta {
      font-size: 14px;
      color: var(--text-secondary);
    }

    /* Markdown 内容美化 (仿 GitHub 风格) */
    .markdown-body {
      font-size: 16px;
      line-height: 1.6;
    }

    .markdown-body h1, .markdown-body h2, .markdown-body h3 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    .markdown-body h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid #d0d7de; }
    .markdown-body h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid #d0d7de; }
    .markdown-body h3 { font-size: 1.25em; }

    .markdown-body p { margin-bottom: 16px; }
    
    .markdown-body a { color: var(--accent-color); text-decoration: none; }
    .markdown-body a:hover { text-decoration: underline; }

    .markdown-body blockquote {
      margin: 0 0 16px;
      padding: 0 1em;
      color: var(--text-secondary);
      border-left: 0.25em solid var(--border-color);
    }

    .markdown-body ul, .markdown-body ol { padding-left: 2em; margin-bottom: 16px; }

    /* 表格样式 */
    .markdown-body table {
      border-spacing: 0;
      border-collapse: collapse;
      margin-bottom: 16px;
      width: max-content;
      max-width: 100%;
      overflow: auto;
      display: block;
    }
    .markdown-body table th, .markdown-body table td {
      padding: 6px 13px;
      border: 1px solid var(--border-color);
    }
    .markdown-body table tr { background-color: #fff; border-top: 1px solid #c6cbd1; }
    .markdown-body table tr:nth-child(2n) { background-color: #f6f8fa; }

    /* 代码块微调 */
    .markdown-body pre {
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      background-color: #f6f8fa;
      border-radius: 6px;
    }
    .markdown-body code {
      padding: 0.2em 0.4em;
      margin: 0;
      font-size: 85%;
      background-color: rgba(175,184,193,0.2);
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    .markdown-body pre code {
      padding: 0;
      background-color: transparent;
    }
    
    /* 图片自适应 */
    .markdown-body img {
      max-width: 100%;
      box-sizing: content-box;
      background-color: #fff;
    }
    
    /* KaTeX 字体修复 */
    .katex { font-size: 1.1em; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <header>
        <h1 class="title">${md.utils.escapeHtml(title)}</h1>
        <div class="meta">${md.utils.escapeHtml(authorInfo)}</div>
      </header>
      <article class="markdown-body">
        ${renderedBody}
      </article>
    </div>
  </div>
</body>
</html>`;
}

// --- Main Apply Function ---

export function apply(ctx: Context, config: Config = {}) {
  const endpoint = config.endpoint || ''
  const userAgent = config.userAgent || 'Uptime-Kuma'
  ctx.luogu_saver = new LuoguSaverClient(ctx, endpoint, userAgent)

  ctx.command('获取文章信息 <id>', '获取文章信息')
    .action(async ({ options }, id) => {
      if (!id) return '请提供文章 ID'
      const art = await ctx.luogu_saver.getArticle(id)
      console.log(art)
      if (!art) return '未找到文章'
      return `${art.title} by ${art.authorId}`
    })

  ctx.command('创建保存任务 <target> <targetId>', '创建类型为 save 的任务')
    .action(async (_, target, targetId) => {
      const body: TaskCreateSave = { type: 'save', payload: { target, targetId } }
      const id = await ctx.luogu_saver.createTask(body)
      if (!id) return '创建失败'
      return `保存任务已创建，ID: ${id}`
    })

  ctx.command('查询任务状态 <id>', '查询任务状态')
    .action(async ({ options }, id) => {
      if (!id) return '请提供任务 ID'
      const task = await ctx.luogu_saver.getTask(id)
      if (task == null) return '任务不存在或返回为空'
      if (typeof task === 'object' && 'status' in task) return `任务 ${id} 状态: ${statusToString((task as any).status)}`
      return JSON.stringify(task)
    })

  ctx.command('获取文章 <id>', '获取文章并截取长图')
    .option('width', '-w <width:number>', { fallback: 960 })
    .action(async ({ session, options }, id) => {
      if (!id) return '请提供文章 ID'
      const art = await ctx.luogu_saver.getArticle(id)
      if (!art) return '未找到文章'

      // 优先使用原始 content 进行 Markdown 渲染
      const rawContent = art.content ?? art.renderedContent ?? ''
      const title = art.title ?? ''
      const authorInfo = `作者 UID: ${art.authorId}`

      const html = await generateHtml(title, authorInfo, rawContent)

      if (!ctx.puppeteer) return '当前没有可用的 puppeteer 服务。'

      const page = await ctx.puppeteer.page()
      try {
        const width = Number(options.width) || 960
        // 适当增加高度以防截断，虽然 screenshot fullPage 会自动处理
        await page.setViewport({ width, height: 800, deviceScaleFactor: 2 })
        
        await page.setContent(html, { waitUntil: 'networkidle0' })

        // --- 核心修改开始 ---
        
        // 1. 等待 Web 字体加载完成 (这是解决 LaTeX 不显示的关键)
        try {
          await page.evaluate(() => document.fonts.ready);
        } catch (e) {
          ctx.logger.warn('等待字体加载超时或失败', e);
        }

        // 2. 等待图片加载 (保留你原有的逻辑，稍微优化)
        try {
            await page.evaluate(() => new Promise((resolve) => {
              const imgs = Array.from(document.images)
              if (!imgs.length) return resolve(null)
              let loaded = 0
              
              // 增加超时机制，防止某张图片卡死整个流程
              const timeout = setTimeout(() => resolve(null), 5000);

              const handler = () => { 
                loaded++; 
                if (loaded === imgs.length) {
                  clearTimeout(timeout);
                  resolve(null);
                }
              }
              
              imgs.forEach((img) => {
                if (img.complete) {
                  loaded++;
                } else {
                  img.addEventListener('load', handler)
                  img.addEventListener('error', handler) // 图片挂了也要继续
                }
              })
              // 如果所有图片初始就是 complete 状态
              if (loaded === imgs.length) {
                  clearTimeout(timeout);
                  resolve(null);
              }
            }))
        } catch (e) {}

        // --- 核心修改结束 ---

        const buffer = await page.screenshot({ fullPage: true, type: 'png' })
        return h.image(buffer as Buffer, 'image/png')
      } catch (err) {
        ctx.logger.error('截图文章失败', err)
        return '获取失败'
      } finally {
        page.close()
      }
    })

  ctx.command('获取剪贴板 <id>', '获取剪贴板内容并截取长图')
    .option('width', '-w <width:number>', { fallback: 960 })
    .action(async ({ session, options }, id) => {
      if (!id) return '请提供剪贴板 ID'
      const paste = await ctx.luogu_saver.getPaste(id)
      if (!paste) return '未找到剪贴板内容'

      const rawContent = paste.content ?? paste.renderedContent ?? ''
      const title = `剪贴板: ${paste.id}`
      const authorInfo = paste.author ? `创建者: ${paste.author.name} (UID: ${paste.author.id})` : `创建者 UID: ${paste.authorId}`

      const html = await generateHtml(title, authorInfo, rawContent)

      if (!ctx.puppeteer) return '当前没有可用的 puppeteer 服务。'

      const page = await ctx.puppeteer.page()
      try {
        const width = Number(options.width) || 960
        await page.setViewport({ width, height: 800, deviceScaleFactor: 2 })
        
        await page.setContent(html, { waitUntil: 'networkidle0' })

        // 等待 KaTeX 客户端渲染完成
        try {
          await page.waitForFunction('window.__katex_render_done === true', { timeout: 20000 })
        } catch (e) {}

        try {
            await page.evaluate(() => new Promise((resolve) => {
              const imgs = Array.from(document.images)
              if (!imgs.length) return resolve(null)
              let loaded = 0
              imgs.forEach((img) => {
                if (img.complete) { loaded++; return }
                const handler = () => { loaded++; if (loaded === imgs.length) resolve(null) }
                img.addEventListener('load', handler)
                img.addEventListener('error', handler)
              })
              if (loaded === imgs.length) resolve(null)
              setTimeout(() => resolve(null), 5000)
            }))
        } catch (e) {}

        const buffer = await page.screenshot({ fullPage: true, type: 'png' })
        return h.image(buffer as Buffer, 'image/png')
      } catch (err) {
        ctx.logger.error('截图剪贴板失败', err)
        return '获取失败。'
      } finally {
        page.close()
      }
    })
}