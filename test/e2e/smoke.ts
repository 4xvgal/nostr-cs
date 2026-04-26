import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { CSClient, type Ticket } from '../../src/index.js'

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

const CONTAINER = 'nostr-cs-e2e-relay'
const HOST_PORT = 17777
const URL = `ws://127.0.0.1:${HOST_PORT}`

async function runCmd(cmd: string[], { capture = false } = {}) {
  const proc = Bun.spawn(cmd, {
    stdout: capture ? 'pipe' : 'ignore',
    stderr: capture ? 'pipe' : 'ignore',
  })
  const code = await proc.exited
  if (!capture) return { code, stdout: '', stderr: '' }
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { code, stdout, stderr }
}

async function dockerStart() {
  await runCmd(['docker', 'rm', '-f', CONTAINER])
  const { code, stderr } = await runCmd(
    [
      'docker', 'run', '-d', '--rm',
      '--name', CONTAINER,
      '-p', `${HOST_PORT}:8080`,
      'scsibug/nostr-rs-relay:latest',
    ],
    { capture: true },
  )
  if (code !== 0) throw new Error(`docker run failed: ${stderr}`)
}

async function dockerStop() {
  await runCmd(['docker', 'stop', CONTAINER])
}

async function waitForReady(timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await probeWebSocket()
    if (ok) return
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`relay not ready within ${timeoutMs}ms`)
}

function probeWebSocket(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL)
    const done = (v: boolean) => {
      try { ws.close() } catch {}
      resolve(v)
    }
    ws.onopen = () => done(true)
    ws.onerror = () => done(false)
    setTimeout(() => done(false), 1000)
  })
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
  ])
}

async function main() {
  console.log('[docker] starting relay…')
  await dockerStart()
  try {
    console.log('[docker] waiting for ready…')
    await waitForReady(15000)
    console.log(`[relay] ${URL}`)

    const customerSk = generateSecretKey()
    const agentSk = generateSecretKey()
    const customerPk = getPublicKey(customerSk)
    const agentPk = getPublicKey(agentSk)
    console.log(`[keys] customer=${customerPk.slice(0, 8)}… agent=${agentPk.slice(0, 8)}…`)

    const agent = new CSClient({
      key: { type: 'hex', value: bytesToHex(agentSk) },
      relays: { bootstrap: [URL] },
      profile: { name: 'agent', csRole: 'agent' },
    })
    const customer = new CSClient({
      key: { type: 'hex', value: bytesToHex(customerSk) },
      relays: { bootstrap: [URL] },
      profile: { name: 'customer', csRole: 'customer' },
    })

    console.log('[agent] connecting…')
    await agent.connect()
    console.log('[customer] connecting…')
    await customer.connect()

    const received = new Promise<Ticket>((resolve) => {
      agent.onTicket((t) => resolve(t))
    })

    await new Promise((r) => setTimeout(r, 300))

    console.log('[customer] createTicket')
    const created = await customer.createTicket({
      title: 'login broken',
      body: 'cannot sign in since 09:00',
      agentPubkey: agentPk,
      priority: 'high',
      category: 'technical',
    })
    console.log(`[customer] published ticket ${created.id.toString()} (event ${created.eventId})`)

    const ticket = await withTimeout(received, 8000, 'agent.onTicket')
    console.log(`[agent] received ticket ${ticket.id.toString()}`)

    const checks: [string, boolean][] = [
      ['ticketId matches', ticket.id.toString() === created.id.toString()],
      ['customerPubkey matches', ticket.customerPubkey === customerPk],
      ['agentPubkey matches', ticket.agentPubkey === agentPk],
      ['title matches', ticket.title === 'login broken'],
      ['body matches', ticket.body === 'cannot sign in since 09:00'],
      ['priority matches', ticket.priority === 'high'],
      ['category matches', ticket.category === 'technical'],
    ]
    const failed = checks.filter(([, ok]) => !ok)
    if (failed.length > 0) {
      for (const [name] of failed) console.error(`[FAIL] ${name}`)
      console.error('expected:', {
        id: created.id.toString(), customerPubkey: customerPk, agentPubkey: agentPk,
      })
      console.error('got:', {
        id: ticket.id.toString(),
        customerPubkey: ticket.customerPubkey,
        agentPubkey: ticket.agentPubkey,
        title: ticket.title, body: ticket.body,
        priority: ticket.priority, category: ticket.category,
      })
      process.exit(1)
    }

    console.log('[PASS] smoke round-trip ok')
    await agent.disconnect()
    await customer.disconnect()
  } finally {
    console.log('[docker] stopping relay…')
    await dockerStop()
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('[ERROR]', e)
    dockerStop().finally(() => process.exit(1))
  },
)
