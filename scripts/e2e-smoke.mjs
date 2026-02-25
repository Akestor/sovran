/**
 * E2E Smoke Tests — runs against live Docker containers
 *
 * Prerequisites:
 *   docker compose -f docker-compose.full.yml up --build -d
 *
 * Usage:
 *   node scripts/e2e-smoke.mjs
 */

const API = 'http://localhost:3000';
let passed = 0;
let failed = 0;

function assert(condition, msg, detail) {
  if (!condition) {
    failed++;
    console.error(`  FAIL: ${msg}`);
    if (detail) console.error(`        Detail: ${JSON.stringify(detail)}`);
    throw new Error(msg);
  }
  passed++;
  console.log(`  PASS: ${msg}`);
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function seedInviteCode(code) {
  const { createHash, randomBytes } = await import('node:crypto');
  const { execSync } = await import('node:child_process');
  const hash = createHash('sha256').update(code).digest('hex');
  const id = randomBytes(8).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const sql = `INSERT INTO invite_codes (id, code_hash, expires_at, max_uses, use_count) VALUES ('${id}', '${hash}', '${expires}', 100, 0) ON CONFLICT (id) DO NOTHING;`;
  execSync(`docker exec sovran-postgres-1 psql -U sovran -d sovran -c "${sql}"`, { stdio: 'pipe' });
}

// ─── Test 1: Full Flow ───────────────────────────────────────────
async function testFullFlow() {
  console.log('\n=== Test 1: Full Flow (Register → Server → Invite → Join → Message) ===\n');

  const suffix = Date.now().toString(36);
  const regCode = `e2e-reg-${suffix}`;
  await seedInviteCode(regCode);

  // Register user A
  const regA = await api('POST', '/auth/register', {
    username: `alice${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode,
  });
  assert(regA.status === 201, `Register user A: ${regA.status}`, regA.data);
  const tokenA = regA.data.accessToken;
  const userA = regA.data.user;

  // Register user B
  const regB = await api('POST', '/auth/register', {
    username: `bob${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode,
  });
  assert(regB.status === 201, `Register user B: ${regB.status}`);
  const tokenB = regB.data.accessToken;

  // User A creates server
  const createSrv = await api('POST', '/servers', { name: `E2E Server ${suffix}` }, tokenA);
  assert(createSrv.status === 201, `Create server: ${createSrv.status}`);
  const serverId = createSrv.data.id;
  assert(createSrv.data.ownerId === userA.id, 'Server owner is user A');

  // User A lists servers
  const listSrv = await api('GET', '/servers', null, tokenA);
  assert(listSrv.status === 200, `List servers: ${listSrv.status}`);
  assert(listSrv.data.some(s => s.id === serverId), 'Server appears in list');

  // User A lists channels (should have #general)
  const listCh = await api('GET', `/servers/${serverId}/channels`, null, tokenA);
  assert(listCh.status === 200, `List channels: ${listCh.status}`);
  assert(listCh.data.length >= 1, 'At least 1 channel exists');
  const generalCh = listCh.data.find(c => c.name === 'general');
  assert(generalCh, '#general channel exists');

  // User A creates invite
  const createInv = await api('POST', `/servers/${serverId}/invites`, { maxUses: 10, expiresInDays: 1 }, tokenA);
  assert(createInv.status === 201, `Create invite: ${createInv.status}`);
  const inviteCode = createInv.data.code;
  assert(inviteCode && inviteCode.length > 0, 'Invite code returned');

  // User B joins server via invite
  const join = await api('POST', '/servers/join', { inviteCode }, tokenB);
  assert(join.status === 200, `Join server: ${join.status}`);
  assert(join.data.serverId === serverId, 'Joined correct server');
  assert(join.data.role === 'MEMBER', 'Joined as MEMBER');

  // User A sends message
  const sendA = await api('POST', `/servers/${serverId}/channels/${generalCh.id}/messages`, { content: 'Hello from Alice!' }, tokenA);
  assert(sendA.status === 201, `User A send message: ${sendA.status}`);
  assert(sendA.data.content === 'Hello from Alice!', 'Message content correct');
  assert(sendA.data.authorId === userA.id, 'Author is user A');

  // User B sends message
  const sendB = await api('POST', `/servers/${serverId}/channels/${generalCh.id}/messages`, { content: 'Hello from Bob!' }, tokenB);
  assert(sendB.status === 201, `User B send message: ${sendB.status}`);

  // User B reads message history
  const history = await api('GET', `/servers/${serverId}/channels/${generalCh.id}/messages?limit=50`, null, tokenB);
  assert(history.status === 200, `Read history: ${history.status}`);
  assert(history.data.length >= 2, `History has >= 2 messages (got ${history.data.length})`);
  assert(history.data.some(m => m.content === 'Hello from Alice!'), 'Alice message in history');
  assert(history.data.some(m => m.content === 'Hello from Bob!'), 'Bob message in history');

  // User A deletes own message
  const delMsg = await api('DELETE', `/messages/${sendA.data.id}`, null, tokenA);
  assert(delMsg.status === 204, `Delete own message: ${delMsg.status}`);

  // Verify deleted message not in history
  const historyAfter = await api('GET', `/servers/${serverId}/channels/${generalCh.id}/messages?limit=50`, null, tokenB);
  assert(!historyAfter.data.some(m => m.id === sendA.data.id), 'Deleted message not in history');

  console.log('\n  Test 1 complete.\n');
}

// ─── Test 2: Channel + Pagination ────────────────────────────────
async function testChannelPagination() {
  console.log('\n=== Test 2: Channel Creation + Message Pagination ===\n');

  const suffix = Date.now().toString(36);
  const regCode = `e2e-pag-${suffix}`;
  await seedInviteCode(regCode);

  // Register user
  const reg = await api('POST', '/auth/register', {
    username: `paguser${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode,
  });
  assert(reg.status === 201, `Register: ${reg.status}`, reg.data);
  const token = reg.data.accessToken;

  // Create server
  const srv = await api('POST', '/servers', { name: `Pagination Test ${suffix}` }, token);
  assert(srv.status === 201, `Create server: ${srv.status}`);
  const serverId = srv.data.id;

  // Create custom channel
  const ch = await api('POST', `/servers/${serverId}/channels`, { name: 'dev-talk' }, token);
  assert(ch.status === 201, `Create channel: ${ch.status}`);
  assert(ch.data.name === 'dev-talk', 'Channel name correct');
  const channelId = ch.data.id;

  // Send 5 messages
  const msgIds = [];
  for (let i = 1; i <= 5; i++) {
    const send = await api('POST', `/servers/${serverId}/channels/${channelId}/messages`, { content: `Message ${i}` }, token);
    assert(send.status === 201, `Send message ${i}: ${send.status}`);
    msgIds.push(send.data.id);
  }

  // Fetch all (limit=3, no cursor) — should get latest 3 (desc order)
  const page1 = await api('GET', `/servers/${serverId}/channels/${channelId}/messages?limit=3`, null, token);
  assert(page1.status === 200, `Page 1: ${page1.status}`);
  assert(page1.data.length === 3, `Page 1 has 3 messages (got ${page1.data.length})`);
  assert(page1.data[0].content === 'Message 5', `Page 1 first is Message 5 (got ${page1.data[0].content})`);
  assert(page1.data[2].content === 'Message 3', `Page 1 last is Message 3 (got ${page1.data[2].content})`);

  // Fetch page 2 with before cursor
  const lastId = page1.data[page1.data.length - 1].id;
  const page2 = await api('GET', `/servers/${serverId}/channels/${channelId}/messages?limit=3&before=${lastId}`, null, token);
  assert(page2.status === 200, `Page 2: ${page2.status}`);
  assert(page2.data.length === 2, `Page 2 has 2 messages (got ${page2.data.length})`);
  assert(page2.data[0].content === 'Message 2', `Page 2 first is Message 2 (got ${page2.data[0].content})`);
  assert(page2.data[1].content === 'Message 1', `Page 2 last is Message 1 (got ${page2.data[1].content})`);

  // Rename channel
  const rename = await api('PATCH', `/channels/${channelId}`, { name: 'dev-general' }, token);
  assert(rename.status === 204, `Rename channel: ${rename.status}`);

  // Verify rename
  const channels = await api('GET', `/servers/${serverId}/channels`, null, token);
  const renamed = channels.data.find(c => c.id === channelId);
  assert(renamed && renamed.name === 'dev-general', 'Channel renamed successfully');

  // Non-member cannot read
  const regCode2 = `e2e-nm-${suffix}`;
  await seedInviteCode(regCode2);
  const reg2 = await api('POST', '/auth/register', {
    username: `outsider${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode2,
  });
  assert(reg2.status === 201, `Register outsider: ${reg2.status}`, reg2.data);
  const outsiderToken = reg2.data.accessToken;
  assert(outsiderToken, 'Outsider token exists');
  const forbidden = await api('GET', `/servers/${serverId}/channels/${channelId}/messages?limit=10`, null, outsiderToken);
  assert(forbidden.status === 403, `Non-member blocked: ${forbidden.status}`);

  console.log('\n  Test 2 complete.\n');
}

// ─── Test 3: Presence Endpoint ───────────────────────────────────
async function testPresenceEndpoint() {
  console.log('\n=== Test 3: Presence API Endpoint ===\n');

  const suffix = Date.now().toString(36);
  const regCode = `e2e-pres-${suffix}`;
  await seedInviteCode(regCode);

  const reg = await api('POST', '/auth/register', {
    username: `presuser${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode,
  });
  assert(reg.status === 201, `Register: ${reg.status}`, reg.data);
  const token = reg.data.accessToken;

  const srv = await api('POST', '/servers', { name: `Presence Test ${suffix}` }, token);
  assert(srv.status === 201, `Create server: ${srv.status}`);
  const serverId = srv.data.id;

  // GET presence (no one connected via WS, so list should be empty or just us if GW connected)
  const pres = await api('GET', `/servers/${serverId}/presence`, null, token);
  assert(pres.status === 200, `Presence endpoint: ${pres.status}`);
  assert(Array.isArray(pres.data), 'Presence returns array');

  // Non-member cannot access presence
  const regCode2 = `e2e-prnm-${suffix}`;
  await seedInviteCode(regCode2);
  const reg2 = await api('POST', '/auth/register', {
    username: `presnm${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode2,
  });
  const outsiderToken = reg2.data.accessToken;
  const forbidden = await api('GET', `/servers/${serverId}/presence`, null, outsiderToken);
  assert(forbidden.status === 403, `Non-member presence blocked: ${forbidden.status}`);

  console.log('\n  Test 3 complete.\n');
}

// ─── Test 4: Attachment Upload Flow ───────────────────────────────
async function testAttachmentUploadFlow() {
  console.log('\n=== Test 4: Attachment Upload Flow ===\n');

  const suffix = Date.now().toString(36);
  const regCode = `e2e-att-${suffix}`;
  await seedInviteCode(regCode);

  const reg = await api('POST', '/auth/register', {
    username: `attuser${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode,
  });
  assert(reg.status === 201, `Register: ${reg.status}`, reg.data);
  const token = reg.data.accessToken;

  const srv = await api('POST', '/servers', { name: `Attachment Test ${suffix}` }, token);
  assert(srv.status === 201, `Create server: ${srv.status}`);
  const serverId = srv.data.id;

  const listCh = await api('GET', `/servers/${serverId}/channels`, null, token);
  assert(listCh.status === 200, `List channels: ${listCh.status}`);
  const generalCh = listCh.data.find(c => c.name === 'general');
  assert(generalCh, '#general channel exists');
  const channelId = generalCh.id;

  // Init upload
  const init = await api('POST', `/servers/${serverId}/channels/${channelId}/attachments/init`, {
    filename: 'test.png',
    contentType: 'image/png',
    sizeBytes: 64,
  }, token);
  assert(init.status === 200, `Init attachment: ${init.status}`, init.data);
  assert(init.data.attachmentId, 'attachmentId returned');
  assert(init.data.uploadUrl, 'uploadUrl returned');
  const attachmentId = init.data.attachmentId;
  const uploadUrl = init.data.uploadUrl;

  // PUT file to MinIO (presigned URL)
  const fileContent = Buffer.alloc(64, 'x');
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'Content-Length': '64' },
    body: fileContent,
  });
  assert(putRes.ok, `PUT to MinIO: ${putRes.status}`);

  // Complete upload
  const complete = await api('POST', `/attachments/${attachmentId}/complete`, {}, token);
  assert(complete.status === 204, `Complete attachment: ${complete.status}`);

  // Wait for scan stub (worker polls every 5s)
  await new Promise(r => setTimeout(r, 6000));

  // Send message with attachment
  const send = await api('POST', `/servers/${serverId}/channels/${channelId}/messages`, {
    content: 'Message with attachment',
    attachmentIds: [attachmentId],
  }, token);
  assert(send.status === 201, `Send message with attachment: ${send.status}`, send.data);
  assert(send.data.attachments, 'Message has attachments');
  assert(send.data.attachments.length === 1, 'One attachment in message');
  assert(send.data.attachments[0].filename === 'test.png', 'Attachment filename correct');

  // List messages — attachment metadata present
  const history = await api('GET', `/servers/${serverId}/channels/${channelId}/messages?limit=10`, null, token);
  assert(history.status === 200, `List messages: ${history.status}`);
  const msgWithAtt = history.data.find(m => m.attachments && m.attachments.length > 0);
  assert(msgWithAtt, 'Message with attachment in history');

  // Download URL (member)
  const download = await api('GET', `/attachments/${attachmentId}/download`, null, token);
  assert(download.status === 200, `Download URL: ${download.status}`);
  assert(download.data.url, 'Download URL returned');

  // Non-member cannot download
  const regCode2 = `e2e-attnm-${suffix}`;
  await seedInviteCode(regCode2);
  const reg2 = await api('POST', '/auth/register', {
    username: `attnm${suffix}`,
    password: 'Password1234!',
    inviteCode: regCode2,
  });
  const outsiderToken = reg2.data.accessToken;
  const forbidden = await api('GET', `/attachments/${attachmentId}/download`, null, outsiderToken);
  assert(forbidden.status === 403, `Non-member download blocked: ${forbidden.status}`);

  console.log('\n  Test 4 complete.\n');
}

// ─── Run ─────────────────────────────────────────────────────────
async function main() {
  console.log('Sovran E2E Smoke Tests');
  console.log('======================');

  try { await testFullFlow(); } catch (e) { console.error(`\n  Test 1 ABORTED: ${e.message}`); }
  try { await testChannelPagination(); } catch (e) { console.error(`\n  Test 2 ABORTED: ${e.message}`); }
  try { await testPresenceEndpoint(); } catch (e) { console.error(`\n  Test 3 ABORTED: ${e.message}`); }
  try { await testAttachmentUploadFlow(); } catch (e) { console.error(`\n  Test 4 ABORTED: ${e.message}`); }

  console.log(`\n======================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`======================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
