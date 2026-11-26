/**
 * 小实验：JWT 的「登录」到底意味着什么？
 *
 * 结论先放这：
 *   1. 每次 login 都成功，是因为服务端只验密码，然后「新发一张票」，它不记得之前发过几张。
 *   2. 每张票的 exp 互相独立；后登录不会让先登录的票失效（除非你额外实现）。
 *   3. 代价：密码哈希的 CPU、无限增殖的合法凭证、无法枚举/回收的会话。
 *
 * 运行：node l2/sessions.mjs
 */
import { createApp } from './server.mjs';
import { decode } from '../lib/jwt.mjs';

const server = createApp();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const login = (username, password) =>
  call('POST', '/login', { body: { username, password } });

// ---- 1. 连续登录两次，模拟两台设备 ----
console.log('=== 两台设备各登录一次 ===');
const t0 = performance.now();
const deviceA = await login('alice', 'alice-pass');
const cost = performance.now() - t0;
await new Promise((resolve) => setTimeout(resolve, 1100)); // 隔开 1 秒，方便看 exp 不同
const deviceB = await login('alice', 'alice-pass');

const claimsA = decode(deviceA.data.access_token).payload;
const claimsB = decode(deviceB.data.access_token).payload;
console.log(`一次登录耗时约 ${cost.toFixed(1)} ms（scrypt 验密码是故意的慢）`);
console.log('设备 A 的 jti:', claimsA.jti);
console.log('设备 B 的 jti:', claimsB.jti, '（不同 -> 两张独立的票）');
console.log('设备 A 的 exp:', claimsA.exp, '设备 B 的 exp:', claimsB.exp);
console.log();

console.log('=== 两张票都能用吗？ ===');
console.log('A 访问 /me:', (await call('GET', '/me', { token: deviceA.data.access_token })).status);
console.log('B 访问 /me:', (await call('GET', '/me', { token: deviceB.data.access_token })).status);
console.log('-> 后登录没有踢掉先登录的，因为服务端根本没记录「谁登录过」');
console.log();

// ---- 2. 只登出 A，B 不受影响 ----
console.log('=== 登出设备 A ===');
await call('POST', '/logout', { token: deviceA.data.access_token });
console.log('A 再访问 /me:', (await call('GET', '/me', { token: deviceA.data.access_token })).status, '(revoked)');
console.log('B 再访问 /me:', (await call('GET', '/me', { token: deviceB.data.access_token })).status, '(不受影响)');
console.log();

// ---- 3. 不限次数：连开 5 张票，全部有效 ----
console.log('=== 连续登录 5 次，服务端有没有上限？ ===');
const tickets = [];
for (let i = 0; i < 5; i += 1) {
  const res = await login('alice', 'alice-pass');
  tickets.push(res.data.access_token);
}
const statuses = [];
for (const token of tickets) {
  statuses.push((await call('GET', '/me', { token })).status);
}
console.log('5 张票的访问结果:', statuses.join(', '), '-> 没有并发上限，也没有登记');
console.log();

// ---- 4. 想「全部踢下线」，只有主动 bump 版本 ----
console.log('=== 想一次踢掉所有设备 ===');
await call('POST', '/logout-all', { token: deviceB.data.access_token });
let alive = 0;
for (const token of [...tickets, deviceB.data.access_token]) {
  if ((await call('GET', '/me', { token })).status === 200) alive += 1;
}
console.log(`logout-all 之后还活着的票：${alive} 张（应为 0）`);
console.log();
console.log('结论：所谓「单设备登录」，不是 JWT 自带的，是你在服务端额外做的策略。');

server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));
