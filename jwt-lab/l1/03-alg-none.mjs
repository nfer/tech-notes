/**
 * 实验三：alg=none 攻击。
 *
 * 根因：服务端如果「看 token 的 header 里写的是什么 alg，就用什么 alg 去验」，
 * 攻击者就可以直接声明 alg=none，并把签名段留空。
 */
import { b64uJson, decode, verifySignature } from '../lib/jwt.mjs';

// 攻击者手工拼一个 token：header 说 alg=none，没有签名
const forged =
  b64uJson({ alg: 'none', typ: 'JWT' }) +
  '.' +
  b64uJson({ sub: 'attacker', role: 'admin' }) +
  '.';

console.log('伪造的 token:', forged);
console.log('它解码出来是:', decode(forged));
console.log();

// ---- 有漏洞的验签实现（历史真实漏洞的简化版）----
function vulnerableVerify(token, secret) {
  const { header, payload } = decode(token);
  if (header.alg === 'none') return { ok: true, payload }; // ← 灾难
  if (header.alg === 'HS256') return verifySignature(token, secret);
  return { ok: false };
}

console.log('有漏洞的实现 ->', vulnerableVerify(forged, 'anything'));
console.log();

// ---- 正确的做法：服务端自己决定允许哪些算法，白名单之外一律拒绝 ----
console.log('正确的实现   ->', verifySignature(forged, 'anything'));
console.log();
console.log('要点：alg 是「攻击者可控的输入」，不是「可信的元数据」。');
console.log('所以验签函数的签名应该是 verify(token, secret, { algorithms: ["HS256"] })，');
console.log('永远不要让 token 自己决定用什么算法验。');
