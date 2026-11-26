/**
 * 实验二：篡改 payload。
 *
 * 场景：攻击者拿到了自己的合法 token，想把 role 从 user 改成 admin。
 * 关键问题：改完之后，服务端凭什么不信？
 */
import { sign, decode, verifySignature, b64uJson } from '../lib/jwt.mjs';

const SECRET = 'dev-secret-do-not-use-in-prod';
const token = sign({ sub: 'u_1001', name: '小明', role: 'user' }, SECRET, { expiresIn: 3600 });

const { parts } = decode(token);

// ---- 攻击 1：改 payload，签名保持原样 ----
const evilPayload = { ...decode(token).payload, role: 'admin' };
const forged = `${parts[0]}.${b64uJson(evilPayload)}.${parts[2]}`;

console.log('原始 payload :', decode(token).payload);
console.log('篡改 payload :', evilPayload);
console.log('篡改后的 token 验签:', verifySignature(forged, SECRET).ok, '| 原因:', verifySignature(forged, SECRET).reason);
console.log();

// ---- 攻击 2：把 exp 改到 10 年后，签名保持原样 ----
const longLived = { ...decode(token).payload, exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600 };
const forged2 = `${parts[0]}.${b64uJson(longLived)}.${parts[2]}`;
console.log('延长 exp 后验签:', verifySignature(forged2, SECRET).ok, '| 原因:', verifySignature(forged2, SECRET).reason);
console.log();

// ---- 但如果服务端「只解码不验签」，篡改就成功了 ----
// 下面这段是典型的错误写法，故意写出来给你看它有多危险。
function badServer(token) {
  const { payload } = decode(token); // 只解码，然后直接相信
  return { user: payload.sub, role: payload.role, isAdmin: payload.role === 'admin' };
}

console.log('一个不验签的服务端看到篡改 token ->', badServer(forged));
console.log();
console.log('要让篡改通过验签，攻击者必须重新计算 HMAC，而他需要 secret。');
console.log('所以：secret 只能待在服务端；一旦泄露，任何人都能签发任意身份。');
