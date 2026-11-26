/**
 * Lesson 2 自测：把 9 种「看起来都有 token」的请求跑一遍，看服务端分别怎么答。
 * 运行：./run l2/test.mjs
 */
import { createApp, config, db } from './server.mjs';
import { sign, b64uJson } from '../lib/jwt.mjs';

const server = createApp();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? `  -> ${JSON.stringify(detail)}` : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function login(username, password) {
  const res = await call('POST', '/login', { body: { username, password } });
  return res.data?.access_token;
}

const mint = (payload, opts = {}) =>
  sign(payload, config.secret, {
    expiresIn: 60,
    issuer: config.issuer,
    audience: config.audience,
    ...opts,
  });

// ---------- 1. 正常流程 ----------
console.log('\n[1] 正常流程');
check('不带 token 访问 /me -> 401 no_token', (await call('GET', '/me')).data?.error === 'no_token');

const alice = await login('alice', 'alice-pass');
check('alice 登录拿到 token', Boolean(alice));

const me = await call('GET', '/me', { token: alice });
check('/me -> 200，用户资料来自 DB', me.status === 200 && me.data.user.name === 'Alice', me.data);

const admin = await call('GET', '/admin', { token: alice });
check('admin 访问 /admin -> 200', admin.status === 200, admin.data);

// ---------- 2. 认证与授权 ----------
console.log('\n[2] 401 与 403 的分界');
const bob = await login('bob', 'bob-pass');
const forbidden = await call('GET', '/admin', { token: bob });
check('bob 访问 /admin -> 403（有身份，无权限）', forbidden.status === 403 && forbidden.data?.error === 'forbidden', forbidden.data);

// ---------- 3. 攻击形 token ----------
console.log('\n[3] 各种伪造/失效 token');
{
  const [h, p, s] = bob.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  const tampered = `${h}.${b64uJson({ ...payload, role: 'admin' })}.${s}`;
  const res = await call('GET', '/admin', { token: tampered });
  check('篡改 role 为 admin -> 401 bad-signature', res.status === 401 && res.data?.error === 'bad-signature', res.data);
}

{
  const none = `${b64uJson({ alg: 'none', typ: 'JWT' })}.${b64uJson({ sub: 'u_2', role: 'admin' })}.`;
  const res = await call('GET', '/admin', { token: none });
  check('alg=none 伪造 -> 401 alg-not-allowed', res.status === 401 && String(res.data?.error).startsWith('alg-not-allowed'), res.data);
}

{
  const wrongAud = mint({ sub: 'u_2', role: 'admin' }, { audience: 'service-other' });
  const res = await call('GET', '/admin', { token: wrongAud });
  check('签给别的服务的 token -> 401 wrong_audience', res.status === 401 && res.data?.error === 'wrong_audience', res.data);
}

{
  const expired = mint({ sub: 'u_1', role: 'admin' }, { expiresIn: -5 });
  const res = await call('GET', '/me', { token: expired });
  check('签名正确但已过期 -> 401 expired', res.status === 401 && res.data?.error === 'expired', res.data);
}

// ---------- 4. 登出与吊销 ----------
console.log('\n[4] 登出：让已发出去的 token 立刻失效');
const logout = await call('POST', '/logout', { token: bob });
check('bob 登出 -> 200', logout.status === 200, logout.data);
const afterLogout = await call('GET', '/me', { token: bob });
check('登出后原 token -> 401 revoked', afterLogout.status === 401 && afterLogout.data?.error === 'revoked', afterLogout.data);

const alice2 = await login('alice', 'alice-pass');
await call('POST', '/logout-all', { token: alice2 });
const stale = await call('GET', '/me', { token: alice2 });
check('logout-all 后旧 token -> 401 stale_token', stale.status === 401 && stale.data?.error === 'stale_token', stale.data);

const aliceFresh = await login('alice', 'alice-pass');
check('重新登录拿到的新 token 正常', (await call('GET', '/me', { token: aliceFresh })).status === 200);

// ---------- 5. claim 是签发那一刻的快照 ----------
console.log('\n[5] 改了角色，旧 token 会立刻知道吗？');
const bob2 = await login('bob', 'bob-pass');
db.users.get('bob').role = 'admin'; // 模拟后台把 bob 升为 admin
const stillForbidden = await call('GET', '/admin', { token: bob2 });
check('DB 里已是 admin，但旧 token 里写着 role=user -> 仍然 403', stillForbidden.status === 403, stillForbidden.data);

const bobFresh = await login('bob', 'bob-pass');
check('重新登录拿到新 role -> 200', (await call('GET', '/admin', { token: bobFresh })).status === 200);

// ---------- 汇总 ----------
console.log(`\n结果：${passed} passed, ${failed} failed`);
server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));
process.exit(failed === 0 ? 0 : 1);
