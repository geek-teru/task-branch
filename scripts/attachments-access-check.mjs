#!/usr/bin/env node
// 添付（attachments バケット・task_attachments）のアクセス制御を、画面を通さず REST / Storage API を直接たたいて確かめる。
//   DESIGN.md §3.5「添付のアクセス制御の検証」の表は、このスクリプトの結果。
//   画面の検査を迂回されても、バケットの設定と RLS で止まることを見る。
//
// 使い方（ローカルの Supabase を起動してから。依存パッケージは無い）:
//   set -a; eval "$(supabase status -o env)"; set +a   # API_URL / ANON_KEY / SERVICE_ROLE_KEY を環境変数に出す
//   node scripts/attachments-access-check.mjs
//
// 環境変数:
//   API_URL           既定 http://127.0.0.1:54321
//   ANON_KEY          匿名キー（PUBLISHABLE_KEY でも可）
//   SERVICE_ROLE_KEY  テスト用ユーザーの作成と後片付けにだけ使う（検証の操作そのものには使わない）
//   SIGNING_KEYS      AI のトークンを作る署名鍵。既定 supabase/signing_keys.json
//
// 使う JWT:
//   A    … 所有者の人（パスワードでサインイン）
//   B    … 別のユーザー
//   AI   … A のトークンに client_id を足して、ローカルの署名鍵で署名し直したもの（OAuth でつないだ MCP と同じ形）
//   ゲスト … 匿名サインイン（is_anonymous = true）
//
// 毎回ランダムなメールでユーザーを作り、終わったらプロジェクト・Storage のファイル・ユーザーを消す。繰り返し実行できる。
// ローカル専用。本番や共有の環境では実行しない（service role でユーザーを作って消すため）。
// 期待と違う結果が1つでもあれば終了コード 1。

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const API_URL = (process.env.API_URL || 'http://127.0.0.1:54321').replace(/\/$/, '')
const ANON_KEY = process.env.ANON_KEY || process.env.PUBLISHABLE_KEY
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SECRET_KEY
const SIGNING_KEYS = process.env.SIGNING_KEYS || 'supabase/signing_keys.json'
const BUCKET = 'attachments'
const MAX_BYTES = 5 * 1024 * 1024

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('ANON_KEY と SERVICE_ROLE_KEY が要ります。先に set -a; eval "$(supabase status -o env)"; set +a を実行してください')
  process.exit(2)
}
const host = new URL(API_URL).hostname
if (!['127.0.0.1', 'localhost', '::1', 'host.docker.internal'].includes(host)) {
  console.error(`ローカル専用です（API_URL=${API_URL}）`)
  process.exit(2)
}

// ---------------------------------------------------------------------------
// HTTP（パスを正規化しないよう node:http を直接使う。fetch は `..` を解決してしまう）
// ---------------------------------------------------------------------------
function request(method, path, { token, headers = {}, body } = {}) {
  const url = new URL(API_URL)
  const lib = url.protocol === 'https:' ? https : http
  const buf = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  const h = { apikey: ANON_KEY, ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  if (buf && !h['Content-Type']) h['Content-Type'] = 'application/json'
  if (buf) h['Content-Length'] = buf.length
  return new Promise((resolve, reject) => {
    const req = lib.request(
      { protocol: url.protocol, hostname: url.hostname, port: url.port, method, path, headers: h },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks)
          let json = null
          try { json = JSON.parse(raw.toString('utf8')) } catch { /* 本文が JSON でない */ }
          resolve({ status: res.statusCode, headers: res.headers, raw, json })
        })
      },
    )
    req.on('error', reject)
    if (buf) req.write(buf)
    req.end()
  })
}

const short = (r) => {
  const msg = r.json?.message || r.json?.msg || r.json?.error || r.json?.error_description || r.raw.toString('utf8').slice(0, 80)
  return `${r.status}${msg ? ` ${String(msg).replace(/\s+/g, ' ').slice(0, 90)}` : ''}`
}

// ---------------------------------------------------------------------------
// ユーザーとトークン
// ---------------------------------------------------------------------------
const admin = { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY }

async function createUser(label) {
  const email = `attach-check-${label}-${crypto.randomUUID().slice(0, 8)}@task-branch.test`
  const password = crypto.randomBytes(18).toString('base64url')
  const r = await request('POST', '/auth/v1/admin/users', { headers: admin, body: { email, password, email_confirm: true } })
  if (r.status !== 200) throw new Error(`ユーザー作成に失敗: ${short(r)}`)
  const s = await request('POST', '/auth/v1/token?grant_type=password', { body: { email, password } })
  if (s.status !== 200) throw new Error(`サインインに失敗: ${short(s)}`)
  return { id: r.json.id, token: s.json.access_token }
}

async function createGuest() {
  const s = await request('POST', '/auth/v1/signup', { body: {} })
  if (s.status !== 200) throw new Error(`匿名サインインに失敗: ${short(s)}`)
  return { id: s.json.user.id, token: s.json.access_token }
}

// A のトークンに client_id を足して署名し直す（OAuth 2.1 でつないだ MCP のトークンと同じく、sub は A のまま）
function aiTokenFrom(humanToken) {
  const keys = JSON.parse(fs.readFileSync(SIGNING_KEYS, 'utf8'))
  const jwk = keys.find((k) => k.alg === 'ES256' && k.d)
  if (!jwk) throw new Error(`${SIGNING_KEYS} に ES256 の秘密鍵がありません`)
  const [, payloadB64] = humanToken.split('.')
  const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  claims.client_id = 'attachments-access-check'
  const header = { alg: 'ES256', typ: 'JWT', kid: jwk.kid }
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const input = `${enc(header)}.${enc(claims)}`
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
  const sig = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${sig.toString('base64url')}`
}

// ---------------------------------------------------------------------------
// REST / Storage の操作
// ---------------------------------------------------------------------------
const rest = (method, path, token, body, prefer = 'return=representation') =>
  request(method, `/rest/v1/${path}`, { token, body, headers: { Prefer: prefer } })

async function createProject(token, name) {
  const r = await rest('POST', 'projects', token, { name })
  if (r.status !== 201) throw new Error(`プロジェクト作成に失敗: ${short(r)}`)
  return r.json[0].id
}

async function createStory(token, projectId) {
  const r = await rest('POST', 'tasks', token, { project_id: projectId, level: 'story', title: '添付の検証' })
  if (r.status !== 201) throw new Error(`ストーリー作成に失敗: ${short(r)}`)
  return r.json[0].id
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
function newRow(projectId, taskId, userId, mime = 'image/png', size = 68) {
  const id = crypto.randomUUID()
  return { id, project_id: projectId, task_id: taskId, storage_path: `${projectId}/${id}.${EXT[mime]}`, mime_type: mime, size_bytes: size, original_name: 'check.png', created_by: userId }
}
const insertRow = (token, row) => rest('POST', 'task_attachments', token, row)
const deleteRow = (token, id) => rest('DELETE', `task_attachments?id=eq.${id}`, token)

const upload = (token, path, body, contentType = 'image/png', extra = {}) =>
  request('POST', `/storage/v1/object/${BUCKET}/${path}`, { token, body, headers: { 'Content-Type': contentType, ...extra } })
const sign = (token, path) => request('POST', `/storage/v1/object/sign/${BUCKET}/${path}`, { token, body: { expiresIn: 600 } })
const list = (token, prefix) => request('POST', `/storage/v1/object/list/${BUCKET}`, { token, body: { prefix, limit: 100 } })
const removeObjects = (token, paths) => request('DELETE', `/storage/v1/object/${BUCKET}`, { token, body: { prefixes: paths } })
const getPublic = (path) => request('GET', `/storage/v1/object/public/${BUCKET}/${path}`)
const getSigned = (signedURL) => request('GET', `/storage/v1${signedURL}`)

// 1x1 の透明 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------
const results = []
function check(actor, action, expect, ok, r, note = '') {
  const pass = expect === 'allow' ? ok : !ok
  results.push({ actor, action, expect, pass, got: r ? short(r) : note })
  const mark = pass ? '✅' : '❌'
  console.log(`${mark} [${actor}] ${action} — 期待: ${expect === 'allow' ? '許可' : '拒否'} / 結果: ${r ? short(r) : note}`)
}
const is2xx = (r) => r.status >= 200 && r.status < 300

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------
const cleanup = { users: [], projects: [], objects: [] }

async function main() {
  console.log(`== 準備（${API_URL}）`)
  const A = await createUser('a')
  const B = await createUser('b')
  const G = await createGuest()
  cleanup.users.push(A.id, B.id, G.id)
  const AI = { id: A.id, token: aiTokenFrom(A.token) }

  const projA = await createProject(A.token, 'attach-check A')
  const projB = await createProject(B.token, 'attach-check B')
  const projG = await createProject(G.token, 'attach-check guest')
  cleanup.projects.push(projA, projB, projG)
  const storyA = await createStory(A.token, projA)
  const storyB = await createStory(B.token, projB)
  const storyG = await createStory(G.token, projG)

  // AI のトークンが REST で A のものとして通ることを先に確かめる（通らなければ以降の AI の拒否は意味が無い）
  const aiSee = await rest('GET', `projects?id=eq.${projA}&select=id`, AI.token)
  if (aiSee.status !== 200 || aiSee.json.length !== 1) throw new Error(`AI のトークンで A のプロジェクトが読めません: ${short(aiSee)}`)
  console.log('AI のトークン: A のプロジェクトを読める（client_id 付き）')

  console.log('\n== 許可される流れ（A: 行の作成 → アップロード → 署名付き URL → 取得）')
  const main1 = newRow(projA, storyA, A.id)
  let r = await insertRow(A.token, main1)
  check('A', '自分のプロジェクトに行を作る', 'allow', r.status === 201, r)
  r = await upload(A.token, main1.storage_path, PNG)
  check('A', '行のあるパスへ PNG をアップロード', 'allow', is2xx(r), r)
  cleanup.objects.push(main1.storage_path)
  r = await sign(A.token, main1.storage_path)
  check('A', '署名付き URL を作る', 'allow', is2xx(r) && !!r.json?.signedURL, r)
  const signedA = r.json?.signedURL
  if (signedA) {
    r = await getSigned(signedA)
    check('A', '署名付き URL で取得', 'allow', r.status === 200 && r.raw.equals(PNG), r)
  }
  r = await list(A.token, projA)
  check('A', '自分のプロジェクトの一覧（list）', 'allow', is2xx(r) && Array.isArray(r.json) && r.json.length === 1, r)
  r = await sign(AI.token, main1.storage_path)
  check('AI', 'A の添付の署名付き URL を作る（読むのは所有者の人・AI）', 'allow', is2xx(r) && !!r.json?.signedURL, r)

  console.log('\n== 別のユーザー（B）')
  r = await insertRow(B.token, { ...newRow(projA, storyA, B.id) })
  check('B', 'A のプロジェクトに行を作る', 'deny', r.status === 201, r)
  const free1 = newRow(projA, storyA, A.id) // A が行だけ作り、まだアップロードしていないパス
  await insertRow(A.token, free1)
  r = await upload(B.token, free1.storage_path, PNG)
  check('B', 'A の行のあるパスへアップロード', 'deny', is2xx(r), r)
  if (is2xx(r)) cleanup.objects.push(free1.storage_path)
  r = await sign(B.token, main1.storage_path)
  check('B', 'A の添付の署名付き URL を作る', 'deny', is2xx(r) && !!r.json?.signedURL, r)
  r = await list(B.token, projA)
  check('B', 'A のプロジェクトの一覧（list）', 'deny', is2xx(r) && Array.isArray(r.json) && r.json.length > 0, r)
  r = await rest('GET', `task_attachments?project_id=eq.${projA}&select=id`, B.token)
  check('B', 'A の task_attachments の行を読む', 'deny', r.status === 200 && r.json.length > 0, r)
  r = await removeObjects(B.token, [main1.storage_path])
  check('B', 'A の添付を Storage から消す', 'deny', is2xx(r) && Array.isArray(r.json) && r.json.length > 0, r)
  r = await deleteRow(B.token, main1.id)
  check('B', 'A の添付の行を消す', 'deny', r.status === 200 && r.json.length > 0, r)

  console.log('\n== パスの細工（A）')
  const noRowId = crypto.randomUUID()
  r = await upload(A.token, `${projA}/${noRowId}.png`, PNG)
  check('A', '行の無いパスへアップロード', 'deny', is2xx(r), r)
  r = await upload(A.token, `${projB}/${free1.id}.png`, PNG)
  check('A', '行と別の project_id のパスへアップロード', 'deny', is2xx(r), r)
  r = await upload(A.token, `${projA}/../${projB}/${free1.id}.png`, PNG)
  check('A', '`../` を含むパスへアップロード', 'deny', is2xx(r), r)
  r = await upload(A.token, `${projA}/%2E%2E/${projB}/${free1.id}.png`, PNG)
  check('A', '`%2E%2E`（エンコードした ..）を含むパスへアップロード', 'deny', is2xx(r), r)
  if (is2xx(r)) cleanup.objects.push(`${projB}/${free1.id}.png`)
  r = await upload(A.token, `${projA}/${free1.id}.jpg`, PNG, 'image/jpeg')
  check('A', '拡張子違い（行は .png、.jpg へ）のアップロード', 'deny', is2xx(r), r)
  r = await insertRow(A.token, { ...newRow(projA, storyA, A.id), storage_path: `${projB}/${crypto.randomUUID()}.png` })
  check('A', 'storage_path が形に合わない行を作る', 'deny', r.status === 201, r)
  r = await insertRow(A.token, newRow(projA, storyB, A.id))
  check('A', '別のプロジェクトのタスクを指す行を作る', 'deny', r.status === 201, r)
  r = await insertRow(A.token, { ...newRow(projA, storyA, A.id), mime_type: 'image/svg+xml' })
  check('A', 'mime_type が image/svg+xml の行を作る', 'deny', r.status === 201, r)
  r = await insertRow(A.token, { ...newRow(projA, storyA, A.id), created_by: B.id })
  check('A', 'created_by を他人にした行を作る', 'deny', r.status === 201, r)

  console.log('\n== 種類とサイズ（A。行のあるパスへ）')
  for (const [ct, body] of [
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['text/html', '<html><script>alert(1)</script></html>'],
    ['application/octet-stream', PNG],
  ]) {
    r = await upload(A.token, free1.storage_path, body, ct)
    check('A', `Content-Type ${ct} でアップロード`, 'deny', is2xx(r), r)
    if (is2xx(r)) { cleanup.objects.push(free1.storage_path); await removeObjects(A.token, [free1.storage_path]) }
  }
  r = await upload(A.token, free1.storage_path, Buffer.alloc(MAX_BYTES + 1, 0), 'image/png')
  check('A', `5MB を超える（${MAX_BYTES + 1} バイト）アップロード`, 'deny', is2xx(r), r)
  if (is2xx(r)) { cleanup.objects.push(free1.storage_path); await removeObjects(A.token, [free1.storage_path]) }

  console.log('\n== 上書き（A）')
  r = await upload(A.token, main1.storage_path, PNG, 'image/png', { 'x-upsert': 'true' })
  check('A', '既存のパスへ x-upsert: true で上書き', 'deny', is2xx(r), r)
  r = await request('PUT', `/storage/v1/object/${BUCKET}/${main1.storage_path}`, { token: A.token, body: PNG, headers: { 'Content-Type': 'image/png' } })
  check('A', '既存のパスへ PUT（update）で上書き', 'deny', is2xx(r), r)
  r = await upload(A.token, main1.storage_path, PNG)
  check('A', '既存のパスへ同じ名前で再アップロード', 'deny', is2xx(r), r)

  console.log('\n== AI（A のトークン + client_id）')
  r = await insertRow(AI.token, newRow(projA, storyA, A.id))
  check('AI', 'A のプロジェクトに行を作る', 'deny', r.status === 201, r)
  r = await upload(AI.token, free1.storage_path, PNG)
  check('AI', 'A の行のあるパスへアップロード', 'deny', is2xx(r), r)
  if (is2xx(r)) cleanup.objects.push(free1.storage_path)
  r = await removeObjects(AI.token, [main1.storage_path])
  check('AI', 'A の添付を Storage から消す', 'deny', is2xx(r) && Array.isArray(r.json) && r.json.length > 0, r)
  r = await deleteRow(AI.token, main1.id)
  check('AI', 'A の添付の行を消す', 'deny', r.status === 200 && r.json.length > 0, r)

  console.log('\n== ゲスト（匿名サインイン）')
  r = await insertRow(G.token, newRow(projG, storyG, G.id))
  check('ゲスト', '自分のプロジェクトに行を作る', 'deny', r.status === 201, r)
  // Storage のポリシーだけを見るため、行は service role で作っておく
  const gRow = newRow(projG, storyG, G.id)
  const gIns = await request('POST', '/rest/v1/task_attachments', { headers: { ...admin, Prefer: 'return=minimal' }, body: gRow })
  if (gIns.status !== 201) throw new Error(`service role での行の作成に失敗: ${short(gIns)}`)
  r = await upload(G.token, gRow.storage_path, PNG)
  check('ゲスト', '自分の行のあるパスへアップロード（行は service role で用意）', 'deny', is2xx(r), r)
  if (is2xx(r)) cleanup.objects.push(gRow.storage_path)

  console.log('\n== 公開 URL・行の削除後')
  r = await getPublic(main1.storage_path)
  check('匿名', '公開 URL（/object/public/...）で取得', 'deny', r.status === 200, r)
  r = await request('GET', `/storage/v1/object/${BUCKET}/${main1.storage_path}`)
  check('匿名', 'トークン無しで認証付きの取得（/object/...）', 'deny', r.status === 200, r)
  // 行だけ消す（ファイルは残る）→ 署名付き URL を作れない
  const orphan = newRow(projA, storyA, A.id)
  await insertRow(A.token, orphan)
  r = await upload(A.token, orphan.storage_path, PNG)
  if (!is2xx(r)) throw new Error(`準備のアップロードに失敗: ${short(r)}`)
  cleanup.objects.push(orphan.storage_path)
  r = await deleteRow(A.token, orphan.id)
  check('A', '行を消す（ファイルは残す）', 'allow', r.status === 200 && r.json.length === 1, r)
  r = await sign(A.token, orphan.storage_path)
  check('A', '行を消したあとに署名付き URL を作る', 'deny', is2xx(r) && !!r.json?.signedURL, r)
  r = await list(A.token, projA)
  check('A', '行を消したファイルが一覧（list）に出ない', 'allow', is2xx(r) && Array.isArray(r.json) && !r.json.some((o) => orphan.storage_path.endsWith(o.name)), r)

  console.log('\n== 中身が HTML の PNG（記録）')
  const htmlRow = newRow(projA, storyA, A.id)
  await insertRow(A.token, htmlRow)
  r = await upload(A.token, htmlRow.storage_path, '<html><body><script>alert(document.domain)</script></body></html>', 'image/png')
  check('A', 'HTML の中身を Content-Type image/png でアップロード（拡張子と Content-Type だけを見る）', 'allow', is2xx(r), r)
  cleanup.objects.push(htmlRow.storage_path)
  r = await sign(A.token, htmlRow.storage_path)
  if (r.json?.signedURL) {
    r = await getSigned(r.json.signedURL)
    const ct = r.headers['content-type']
    const nosniff = r.headers['x-content-type-options']
    console.log(`   取得時の Content-Type: ${ct} / X-Content-Type-Options: ${nosniff ?? '(なし)'} / Content-Disposition: ${r.headers['content-disposition'] ?? '(なし)'}`)
    check('A', '取得時の Content-Type が image/png のまま（text/html として返らない）', 'allow', String(ct).startsWith('image/png'), r)
    results.push({ actor: '記録', action: 'HTML の中身の PNG を取得したときのヘッダー', expect: 'record', pass: true, got: `Content-Type: ${ct} / X-Content-Type-Options: ${nosniff ?? '(なし)'}` })
  }

  console.log('\n== 削除（A: Storage のファイル → 行の順）')
  r = await removeObjects(A.token, [main1.storage_path])
  check('A', '自分の添付を Storage から消す', 'allow', is2xx(r) && Array.isArray(r.json) && r.json.length === 1, r)
  r = await deleteRow(A.token, main1.id)
  check('A', '自分の添付の行を消す', 'allow', r.status === 200 && r.json.length === 1, r)
  r = await sign(A.token, main1.storage_path)
  check('A', '消したあとに署名付き URL を作る', 'deny', is2xx(r) && !!r.json?.signedURL, r)
}

async function teardown() {
  // Storage のファイル（service role は RLS を通らない）→ プロジェクト（tasks / task_attachments は cascade）→ ユーザー
  const paths = [...new Set(cleanup.objects)]
  if (paths.length) await request('DELETE', `/storage/v1/object/${BUCKET}`, { headers: admin, body: { prefixes: paths } })
  for (const id of cleanup.projects) await request('DELETE', `/rest/v1/projects?id=eq.${id}`, { headers: admin })
  for (const id of cleanup.users) await request('DELETE', `/auth/v1/admin/users/${id}`, { headers: admin })
}

let failed = false
try {
  await main()
} catch (e) {
  console.error(`\n❌ 中断: ${e.message}`)
  failed = true
} finally {
  await teardown()
}
const ng = results.filter((x) => !x.pass)
console.log(`\n== 結果: ${results.filter((x) => x.expect !== 'record').length} 件中 ${ng.length} 件が期待と違う`)
for (const x of ng) console.log(`  ❌ [${x.actor}] ${x.action} → ${x.got}`)
process.exit(failed || ng.length ? 1 : 0)
