/**
 * 手写 JWT（HS256）—— 不依赖任何第三方库，只用 node:crypto。
 * 目的：看清库到底替你做了什么，以及不做什么。
 * 生产环境请用 jose / jsonwebtoken，原因见 README 的「什么时候该用库」。
 */
import crypto from 'node:crypto';

/** 任意字节/字符串 -> base64url（JWT 三段都用它，且去掉 = 填充） */
export function b64u(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64url');
}

export function b64uJson(obj) {
  return b64u(JSON.stringify(obj));
}

export function fromB64u(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function decodeJson(str) {
  return JSON.parse(fromB64u(str));
}

/** 拆开 token，只解码、不校验。任何拿到 token 的人（包括攻击者）都能做这一步。 */
export function decode(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`不是 JWT：应有 3 段，实际 ${parts.length} 段`);
  const [header, payload, signature] = parts;
  return {
    header: decodeJson(header),
    payload: decodeJson(payload),
    signature,
    parts,
  };
}

/** HS256 的签名输入 = base64url(header) + "." + base64url(payload)，用 HMAC-SHA256 算出签名 */
export function hmacSign(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

/**
 * 签发一个 HS256 token。
 * 刻意把 alg 写死成 HS256：不允许调用方随便指定算法，这是防 alg 混淆攻击的第一道门。
 */
export function sign(payload, secret, { expiresIn, issuer, audience, header = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iat: now, ...payload };
  if (expiresIn !== undefined) claims.exp = now + expiresIn;
  if (issuer) claims.iss = issuer;
  if (audience) claims.aud = audience;

  const encodedHeader = b64uJson({ ...header, alg: 'HS256', typ: 'JWT' });
  const encodedPayload = b64uJson(claims);
  const input = `${encodedHeader}.${encodedPayload}`;
  return `${input}.${hmacSign(input, secret)}`;
}

/** 恒定时间比较，避免攻击者靠响应耗时逐字节猜出正确签名 */
function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * 只做一件事：验签。
 *
 * 返回 ok:true 只代表「这段内容确实由持有 secret 的人签发，且一个字节都没被改过」。
 * 它不代表：没过期、不是签给别的服务的、没被吊销、这个人现在还有权限。→ 04-claims.mjs
 */
export function verifySignature(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [h, p, s] = parts;
  let header, payload;
  try {
    header = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    return { ok: false, reason: 'bad-base64-or-json' };
  }

  // 服务端必须自己决定允许哪些算法，而不是相信 token 自己声明的 alg
  if (header.alg !== 'HS256') return { ok: false, reason: `alg-not-allowed:${header.alg}` };

  const expected = hmacSign(`${h}.${p}`, secret);
  if (!safeEqual(s, expected)) return { ok: false, reason: 'bad-signature', header, payload };

  return { ok: true, header, payload };
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/** RFC 7519 的时间类 claim 校验 —— 验签之外的另一半工作 */
export function validateTimeClaims(payload, { clockSkewSeconds = 0 } = {}) {
  const t = nowSeconds();
  const problems = [];
  if (typeof payload.exp === 'number' && t >= payload.exp + clockSkewSeconds) problems.push('expired');
  if (typeof payload.nbf === 'number' && t + clockSkewSeconds < payload.nbf) problems.push('not-yet-valid');
  return problems;
}
