import { createServer } from 'node:http'
import { feedConfig } from './config/index.ts'
import { createFeedHandler } from './feeds.ts'

const handle = createFeedHandler(feedConfig)
const port = Number(process.env.FEED_PORT ?? '3001')
const host = process.env.FEED_HOST ?? '127.0.0.1'
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError('FEED_PORT must be an integer between 1 and 65535')
}

const server = createServer(async (request, response) => {
  try {
    const result = await handle(new Request(new URL(request.url ?? '/', 'http://localhost'), {
      method: request.method ?? 'GET',
    }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(Buffer.from(await result.arrayBuffer()))
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ error: { type: 'http', message: 'Feed API request failed' } }))
  }
})

server.listen(port, host, () => {
  console.log(`Feed API listening at http://${host}:${port}`)
})
