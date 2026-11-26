/**
 * 实验四：签名有效 ≠ token 可用。
 *
 * 这是新手最容易踩的误区：「验签通过了，所以这个 token 可信」。
 * 验签只回答一个问题：内容有没有被改过、是不是我签的。
 * 它不回答：过没过期、是不是发给别的服务的、是不是已经被吊销。
 */
import { sign, verifySignature, validateTimeClaims, nowSeconds } from '../lib/jwt.mjs';

const SECRET = 'dev-secret-do-not-use-in-prod';

// 1) 一个「签名完全正确」但已经过期的 token
const expired = sign({ sub: 'u_1001', role: 'user' }, SECRET, { expiresIn: -60 });
const expiredCheck = verifySignature(expired, SECRET);
console.log('过期 token 验签:', expiredCheck.ok, '（签名确实是合法的）');
console.log('但时间校验:', validateTimeClaims(expiredCheck.payload), '-> 必须拒绝');
console.log();

// 2) 签名正确，但 aud 不是本服务：把「签给 A 服务的 token」拿去打 B 服务
const forServiceA = sign({ sub: 'u_1001', role: 'user' }, SECRET, {
  audience: 'service-a',
  expiresIn: 3600,
});
const checkA = verifySignature(forServiceA, SECRET);
console.log('token.aud =', checkA.payload.aud);
console.log('B 服务如果只验签不检查 aud -> 会接受这个 token（越权！）');
console.log('B 服务应该检查 payload.aud === "service-b"，此时应拒绝。');
console.log();

// 3) 签名正确，但 token 已被吊销（登出、改密码、管理员封号）
console.log('JWT 本身没有「作废」按钮：服务端不存 token，改不了已发出去的东西。');
console.log('想立刻失效，只能额外维护状态：黑名单 jti / 用户 token 版本号 / 短过期 + 刷新令牌。');
console.log('这就是「无状态」的代价，L2 会动手实现。');
console.log();

console.log('当前时间戳:', nowSeconds());
