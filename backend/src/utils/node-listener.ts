import type { Hono } from 'hono'
import type { IncomingMessage, ServerResponse } from 'node:http'

interface NodeRequestInit extends RequestInit {
  duplex?: 'half' | 'full'
}

function buildRequest(req: IncomingMessage) {
  const protocol = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url || '/', `${protocol}://${host}`)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, value)
    }
  }

  const method = req.method ?? 'GET'
  const body: BodyInit | null = method === 'GET' || method === 'HEAD' ? null : (req as unknown as BodyInit)
  const requestInit: NodeRequestInit = { method, headers }
  if (body) {
    requestInit.body = body
    requestInit.duplex = 'half'
  }
  return new Request(url, requestInit)
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value)
  }
  if (!response.body) {
    res.end()
    return
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}

export function createNodeListener(app: Hono) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const request = buildRequest(req)
      const response = await app.fetch(request)
      await sendResponse(res, response)
    } catch (error) {
      res.statusCode = 500
      res.end('Internal Server Error')
      console.error('Error handling request', error)
    }
  }
}
