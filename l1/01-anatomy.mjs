import { sign, decode, verifySignature, nowSeconds } from '../lib/jwt.mjs';

const SECRET = 'dev-secret-do-not-use-in-prod';

const token = sign(
  { sub: 'u_1001', name: '小明', role: 'user' },
  SECRET,
  { expiresIn: 3600 },
);

console.log('=== 完整 token ===');
console.log(token);
console.log();

const { parts, header, payload } = decode(token);

console.log('=== 第 1 段 header ===');
console.log(parts[0]);
console.log('解码后:', header);
console.log();

console.log('=== 第 2 段 payload ===');
console.log(parts[1]);
console.log('解码后:', payload);
console.log('exp 是 Unix 秒级时间戳:', payload.exp, '->', new Date(payload.exp * 1000).toISOString());
console.log('距离过期还有', payload.exp - nowSeconds(), '秒');
console.log();

console.log('=== 第 3 段 signature ===');
console.log(parts[2]);
console.log('它其实是 32 字节二进制签名的 base64url 形式，长度 =', Buffer.from(parts[2], 'base64url').length, '字节');
console.log();

console.log('=== 签名到底签了什么 ===');
console.log('签名输入 = 前两段字符串，用 "." 直接拼起来（注意：不是重新 base64，也不是 JSON 再序列化）');
console.log(parts[0] + '.' + parts[1]);
console.log();

console.log('=== 验签 ===');
console.log('用对的 secret :', verifySignature(token, SECRET));
console.log('用错的 secret :', verifySignature(token, 'guess-123'));
console.log('改一个字符再验:', verifySignature(token.slice(0, -1) + 'A', SECRET));
console.log();
console.log('把 payload 里的 role 从 user 改成 admin、签名不动 -> 见 02-tamper.mjs');
