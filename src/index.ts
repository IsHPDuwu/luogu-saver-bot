import { Context, Schema } from 'koishi'

export const name = 'luogu-saver-bot'

export interface Config {
  endpoint?: string
  userAgent?: string
}

export const Config: Schema<Config> = Schema.object({
  endpoint: Schema.string().description('自定义 API endpoint，结尾无需斜杠').role('input').default(''),
  userAgent: Schema.string().description('自定义 User-Agent').role('input').default('Uptime-Kuma'),
})

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

export type CountResponse = { count: number }

class LuoguSaverClient {
  constructor(private ctx: Context, public endpoint: string, public userAgent: string) {
    if (!this.endpoint) this.endpoint = ''
  }

  private buildUrl(path: string) {
    const base = this.endpoint.replace(/\/$/, '')
    if (!base) return path
    console.log(`${base}${path}`)
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
}

declare module 'koishi' {
  interface Context {
    luogu_saver: LuoguSaverClient
  }
}

export function apply(ctx: Context, config: Config = {}) {
  const endpoint = config.endpoint || ''
  const userAgent = config.userAgent || 'Uptime-Kuma'
  ctx.luogu_saver = new LuoguSaverClient(ctx, endpoint, userAgent)

  // 示例命令：获取文章标题
  ctx.command('获取文章信息 <id>', '获取文章信息')
    .action(async ({ options }, id) => {
      if (!id) return '请提供文章 ID'
      const art = await ctx.luogu_saver.getArticle(id)
      console.log(art)
      if (!art) return '未找到文章'
      return `${art.title} by ${art.authorId}`
    })
}
