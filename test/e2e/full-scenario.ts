import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import {
  CSClient,
  type CsatResponse,
  type Message,
  type StatusUpdate,
  type Ticket,
  type TicketReply,
} from '../../src/index.js'

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
  return {
    code,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  }
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

async function waitForReady(timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await probeWebSocket()) return
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`relay not ready within ${timeoutMs}ms`)
}

function waitFor<T>(label: string, attach: (resolve: (v: T) => void) => void, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)
    attach((v) => {
      clearTimeout(t)
      resolve(v)
    })
  })
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main() {
  console.log('[docker] starting relay…')
  await dockerStart()
  try {
    await waitForReady(15000)
    console.log(`[relay] ${URL}`)

    const customerSk = generateSecretKey()
    const agentSk = generateSecretKey()
    const peerAgentSk = generateSecretKey()
    const customerPk = getPublicKey(customerSk)
    const agentPk = getPublicKey(agentSk)
    const peerAgentPk = getPublicKey(peerAgentSk)
    console.log(`[keys] customer=${customerPk.slice(0, 8)}… agent=${agentPk.slice(0, 8)}… peer=${peerAgentPk.slice(0, 8)}…`)

    const mkClient = (sk: Uint8Array, role: 'agent' | 'customer', name: string) =>
      new CSClient({
        key: { type: 'hex', value: bytesToHex(sk) },
        relays: { bootstrap: [URL] },
        profile: { name, csRole: role },
      })

    const customer = mkClient(customerSk, 'customer', 'customer-a')
    const agent = mkClient(agentSk, 'agent', 'agent-b')
    const peerAgent = mkClient(peerAgentSk, 'agent', 'agent-c')

    console.log('[connect] agent / peerAgent / customer')
    await agent.connect()
    await peerAgent.connect()
    await customer.connect()
    await new Promise((r) => setTimeout(r, 500))

    // ── Step 1: customer createTicket → agent onTicket ──────────
    console.log('\n[step 1] customer.createTicket → agent.onTicket')
    const ticketReceived = waitFor<Ticket>('agent.onTicket', (r) => agent.onTicket(r))
    const created = await customer.createTicket({
      title: 'login broken',
      body: 'cannot sign in since 09:00',
      agentPubkey: agentPk,
      priority: 'high',
      category: 'technical',
    })
    const ticket = await ticketReceived
    assert(ticket.id.toString() === created.id.toString(), 'ticketId round-trip')
    assert(ticket.customerPubkey === customerPk, 'ticket.customerPubkey')
    assert(ticket.agentPubkey === agentPk, 'ticket.agentPubkey')
    assert(ticket.title === 'login broken', 'ticket.title decrypted')
    assert(ticket.body === 'cannot sign in since 09:00', 'ticket.body decrypted')
    const threadRoot = ticket.eventId

    // ── Step 2: agent.replyTicket → customer onReply + onMessage ──
    console.log('\n[step 2] agent.replyTicket → customer.onReply + onMessage(channel="reply")')
    const replyReceived = waitFor<TicketReply>('customer.onReply', (r) => customer.onReply(r))
    const replyMsgReceived = waitFor<Message>('customer.onMessage/reply', (r) =>
      customer.onMessage((m) => {
        if (m.channel === 'reply') r(m)
      }),
    )
    await agent.replyTicket({
      ticketId: ticket.id,
      threadRoot,
      body: 'looking into it, please hold',
      customerPubkey: customerPk,
    })
    const reply = await replyReceived
    const replyMsg = await replyMsgReceived
    assert(reply.body === 'looking into it, please hold', 'reply.body decrypted')
    assert(reply.byPubkey === agentPk, 'reply.byPubkey = agent')
    assert(replyMsg.body === reply.body, 'onMessage/reply body matches')
    assert(replyMsg.channel === 'reply', 'onMessage channel = reply')

    // ── Step 3: agent.addInternalNote → peerAgent.onNote ────────
    console.log('\n[step 3] agent.addInternalNote → peerAgent.onNote')
    const noteReceived = waitFor<TicketReply>('peerAgent.onNote', (r) => peerAgent.onNote(r))
    await agent.addInternalNote({
      ticketId: ticket.id,
      threadRoot,
      body: 'auth service returning 500s',
      otherAgentPubkeys: [peerAgentPk],
    })
    const note = await noteReceived
    assert(note.body === 'auth service returning 500s', 'note.body decrypted')
    assert(note.byPubkey === agentPk, 'note.byPubkey = agent')

    // ── Step 4: agent.updateStatus → customer onStatusChange ────
    console.log('\n[step 4] agent.updateStatus → customer.onStatusChange')
    const statusReceived = waitFor<StatusUpdate>('customer.onStatusChange', (r) =>
      customer.onStatusChange(r),
    )
    await agent.updateStatus({
      ticketId: ticket.id,
      threadRoot,
      newStatus: 'in_progress',
      customerPubkey: customerPk,
    })
    const status = await statusReceived
    assert(status.newStatus === 'in_progress', 'status = in_progress')
    assert(status.byPubkey === agentPk, 'status.byPubkey = agent')

    // ── Step 5: customer.sendMessage → agent onMessage (channel=dm) ──
    console.log('\n[step 5] customer.sendMessage (NIP-17 DM) → agent.onMessage(channel="dm")')

    const relayInspect: Array<Record<string, unknown>> = []
    let agentFilterMatches = 0
    const inspectWs = new WebSocket(URL)
    await new Promise<void>((res) => {
      inspectWs.onopen = () => res()
    })
    inspectWs.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data))
        if (!Array.isArray(m) || m[0] !== 'EVENT') return
        if (m[1] === 'inspect1059') {
          relayInspect.push(m[2])
          console.log(`  [relay-inspect] saw kind ${m[2]?.kind} tags=${JSON.stringify(m[2]?.tags)}`)
        } else if (m[1] === 'inspect-agent-filter') {
          agentFilterMatches++
          console.log(`  [agent-filter-raw] matched kind ${m[2]?.kind} — would have reached agent's NDK`)
        }
      } catch {}
    }
    inspectWs.send(JSON.stringify(['REQ', 'inspect1059', { kinds: [1059] }]))
    inspectWs.send(JSON.stringify([
      'REQ', 'inspect-agent-filter', { kinds: [1059], '#p': [agentPk] },
    ]))
    await new Promise((r) => setTimeout(r, 300))

    const dmReceived = waitFor<Message>('agent.onMessage/dm', (r) =>
      agent.onMessage((m) => {
        if (m.channel === 'dm') r(m)
      }),
      15000,
    )
    await customer.sendMessage({
      ticketId: ticket.id,
      threadRoot,
      content: 'still broken, any update?',
      recipientPubkey: agentPk,
    })
    await new Promise((r) => setTimeout(r, 500))
    console.log(`  [diag] relay has ${relayInspect.length} kind-1059 event(s); agent-filter matches=${agentFilterMatches}`)
    const dm = await dmReceived
    inspectWs.close()
    assert(dm.body === 'still broken, any update?', 'dm body decrypted')
    assert(dm.channel === 'dm', 'dm channel = dm')
    assert(dm.senderPubkey === customerPk, 'dm senderPubkey = customer')

    // ── Step 6: agent.updateStatus('resolved') + customer.submitCsat → agent.onCsat ──
    console.log('\n[step 6] agent.updateStatus(resolved) + customer.submitCsat → agent.onCsat')
    await agent.updateStatus({
      ticketId: ticket.id,
      threadRoot,
      newStatus: 'resolved',
      customerPubkey: customerPk,
    })
    await new Promise((r) => setTimeout(r, 200))

    const csatReceived = waitFor<CsatResponse>('agent.onCsat', (r) => agent.onCsat(r))
    await customer.submitCsat({
      ticketId: ticket.id,
      threadRoot,
      agentPubkey: agentPk,
      rating: 5,
      comment: 'nice work',
    })
    const csat = await csatReceived
    assert(csat.rating === 5, 'csat.rating = 5')
    assert(csat.comment === 'nice work', 'csat.comment')
    assert(csat.byPubkey === customerPk, 'csat.byPubkey = customer')

    console.log('\n[PASS] full §17 scenario')
    await agent.disconnect()
    await peerAgent.disconnect()
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
