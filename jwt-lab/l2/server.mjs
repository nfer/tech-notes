/**
 * Lesson 2：一个能跑的 JWT 鉴权服务（零依赖，node:http）
 *
 * 它演示三件事：
 *   1. 验签只是第 1 关，后面还有 exp / iss / aud / jti 黑名单 / 用户状态 四关
 *   2. 401（你是谁？）和 403（知道你是谁，但权限不够）的区别
 *   3. 「登出即失效」必须引入服务端状态：jti 黑名单 + tokenVersion
 *
 * 这不是生产代码：内存存储、无 HTTPS、无速率限制、无审计日志。
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { sign, verifySignature, validateTimeClaims } from '../lib/jwt.mjs';

export const config = {
  port: Number(process.env.PORT ?? 8787),
  secret: process.env.JWT_SECRET ?? 'l2-dev-secret-change-me',
  issuer: 'auth.l2.demo',
  audience: 'api.l2.demo',
  accessTtlSeconds: Number(process.env.ACCESS_TTL ?? 60), // 故意设短，方便观察过期
};

// ---------- 用户表（内存版）----------
// 密码用 scrypt 加盐哈希，绝不存明文。真实项目用 argon2id / bcrypt。
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

function checkPassword(password, stored) {
  const [saltB64, hashB64] = stored.split('.');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export const db = {
  users: new Map([
    ['alice', { id: 'u_1', name: 'Alice', role: 'admin', password: hashPassword('alice-pass'), tokenVersion: 1 }],
    ['bob', { id: 'u_2', name: 'Bob', role: 'user', password: hashPassword('bob-pass'), tokenVersion: 1 }],
  ]),
  // jti -> exp：登出后把 jti 记进来，直到 token 自己过期才能删
  revokedJti: new Map(),
};

function findUserById(id) {
  for (const user of db.users.values()) if (user.id === id) return user;
  return undefined;
}

function publicUser(user) {
  return { id: user.id, name: user.name, role: user.role };
}

// ---------- 签发 ----------
function issueAccessToken(user) {
  return sign(
    {
      sub: user.id,
      name: user.name,
      role: user.role,
      ver: user.tokenVersion, // 用户级版本号：+1 就能让该用户所有旧 token 失效
      jti: crypto.randomUUID(), // 单个 token 的唯一 id：登出时进黑名单
    },
    config.secret,
    {
      expiresIn: config.accessTtlSeconds,
      issuer: config.issuer,
      audience: config.audience,
    },
  );
}

// ---------- 鉴权：五道关 ----------
function authenticate(req) {
  const match = /^Bearer\s+(.+)$/.exec(req.headers.authorization ?? '');
  if (!match) {
    return { ok: false, status: 401, code: 'no_token', detail: '缺少 Authorization: Bearer <token>' };
  }

  // 1. 验签 + 算法白名单（lib 里已固定只接受 HS256）
  const result = verifySignature(match[1], config.secret);
  if (!result.ok) {
    return { ok: false, status: 401, code: result.reason, detail: '签名或算法校验失败' };
  }
  const payload = result.payload;

  // 2. 时间：exp / nbf（注意 lib 的验签没有替你查这个）
  const timeProblems = validateTimeClaims(payload);
  if (timeProblems.length) {
    return { ok: false, status: 401, code: timeProblems[0], detail: 'token 不在有效期内' };
  }

  // 3. 签发方与受众：防止 A 服务签的 token 被拿来打 B 服务
  if (payload.iss !== config.issuer) {
    return { ok: false, status: 401, code: 'wrong_issuer', detail: `iss 应为 ${config.issuer}` };
  }
  if (payload.aud !== config.audience) {
    return { ok: false, status: 401, code: 'wrong_audience', detail: `aud 应为 ${config.audience}` };
  }

  // 4. 吊销：登出过的 jti 直接拒绝
  if (db.revokedJti.has(payload.jti)) {
    return { ok: false, status: 401, code: 'revoked', detail: '该 token 已登出' };
  }

  // 5. 用户当前状态：用户是否存在、token 版本是否过期
  const user = findUserById(payload.sub);
  if (!user) {
    return { ok: false, status: 401, code: 'unknown_user', detail: '用户不存在' };
  }
  if (payload.ver !== user.tokenVersion) {
    return { ok: false, status: 401, code: 'stale_token', detail: '用户已登出所有设备，或 token 版本过期' };
  }

  return { ok: true, user, payload };
}

// ---------- HTTP 小工具 ----------
function writeJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function unauthorized(res, code, detail) {
  // RFC 6750 规定的 401 响应头，客户端据此决定要不要去刷新 token
  writeJson(res, 401, { error: code, detail }, {
    'www-authenticate': `Bearer error="invalid_token", error_description="${code}"`,
  });
}

async function readJson(req, limit = 10_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createApp() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;

    try {
      if (route === 'POST /login') {
        let body;
        try {
          body = await readJson(req);
        } catch {
          return writeJson(res, 400, { error: 'bad_request', detail: '请求体不是合法 JSON' });
        }

        const user = db.users.get(String(body.username ?? ''));
        // 用户名不存在和密码错误返回同一个错误：不告诉攻击者哪个用户名有效
        if (!user || !checkPassword(String(body.password ?? ''), user.password)) {
          return writeJson(res, 401, { error: 'invalid_credentials', detail: '用户名或密码错误' });
        }

        return writeJson(res, 200, {
          access_token: issueAccessToken(user),
          token_type: 'Bearer',
          expires_in: config.accessTtlSeconds,
        });
      }

      if (route === 'GET /me') {
        const auth = authenticate(req);
        if (!auth.ok) return unauthorized(res, auth.code, auth.detail);
        return writeJson(res, 200, {
          user: publicUser(auth.user), // 资料来自 DB，不是直接抄 token 里的
          token: { jti: auth.payload.jti, exp: auth.payload.exp },
        });
      }

      if (route === 'GET /admin') {
        const auth = authenticate(req);
        if (!auth.ok) return unauthorized(res, auth.code, auth.detail);
        // 认证过了，但授权不够 -> 403，不是 401。
        //
        // 这里刻意读 token 里的 role（而不是 auth.user.role），为了让你看到「claim 是快照」：
        // 后台把用户降级/升级后，旧 token 在过期前仍带着旧角色。
        // 换成查 DB 能实时生效，但每个请求都多一次查询——这就是 JWT 要你权衡的地方。
        if (auth.payload.role !== 'admin') {
          return writeJson(res, 403, { error: 'forbidden', detail: '需要 admin 角色' });
        }
        return writeJson(res, 200, { message: `欢迎，管理员 ${auth.user.name}` });
      }

      if (route === 'POST /logout') {
        const auth = authenticate(req);
        if (!auth.ok) return unauthorized(res, auth.code, auth.detail);
        db.revokedJti.set(auth.payload.jti, auth.payload.exp);
        return writeJson(res, 200, { ok: true, message: '当前 token 已加入黑名单' });
      }

      if (route === 'POST /logout-all') {
        const auth = authenticate(req);
        if (!auth.ok) return unauthorized(res, auth.code, auth.detail);
        auth.user.tokenVersion += 1; // 该用户所有已签发 token 立即失效
        return writeJson(res, 200, { ok: true, message: '该用户所有设备已下线' });
      }

      if (route === 'GET /health') {
        return writeJson(res, 200, { ok: true, now: Math.floor(Date.now() / 1000) });
      }

      return writeJson(res, 404, { error: 'not_found' });
    } catch (err) {
      return writeJson(res, 500, { error: 'internal', detail: String(err?.message ?? err) });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const server = createApp();
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`JWT demo server: http://127.0.0.1:${config.port}`);
    console.log(`issuer=${config.issuer} audience=${config.audience} ttl=${config.accessTtlSeconds}s`);
    console.log('账号：alice / alice-pass（admin），bob / bob-pass（user）');
    console.log('接口：POST /login  GET /me  GET /admin  POST /logout  POST /logout-all');
  });
}
