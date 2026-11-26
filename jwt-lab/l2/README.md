# Lesson 2：真实服务端 —— 验签之后的四道关

L1 里 `verifySignature` 只做了第 1 关。真实服务端的鉴权是五关：

| # | 关卡 | 不做的后果 | 代码位置 |
| --- | --- | --- | --- |
| 1 | 验签 + 算法白名单 | 任何人可伪造身份 | `verifySignature()` |
| 2 | `exp` / `nbf` | 过期 token 永久可用 | `validateTimeClaims()` |
| 3 | `iss` / `aud` | A 服务的 token 能打 B 服务 | `authenticate()` |
| 4 | 吊销（`jti` 黑名单 / `tokenVersion`） | 登出、封号后 token 还能用 | `authenticate()` |
| 5 | 用户当前状态（存在、版本） | 已删用户仍能访问 | `authenticate()` |

任何一关不过 → `401`；五关都过但角色不够 → `403`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/login` | `{username,password}` → `{access_token, expires_in}` |
| GET | `/me` | 需要 Bearer；用户资料从 DB 读，不从 token 抄 |
| GET | `/admin` | 需要 `role=admin`，否则 403 |
| POST | `/logout` | 把当前 `jti` 加入黑名单，只废掉这一个 token |
| POST | `/logout-all` | `tokenVersion += 1`，废掉该用户所有设备 |
| GET | `/health` | 存活检查 |

账号：`alice / alice-pass`（admin）、`bob / bob-pass`（user）。
访问令牌默认 60 秒过期（`ACCESS_TTL` 可改），方便你观察过期。

## 运行

```bash
# 终端 1：起服务
./run l2/server.mjs

# 终端 2：把 15 个场景跑一遍（登录、401/403、篡改、alg=none、错 aud、过期、登出、角色快照）
./run l2/test.mjs
```

手工玩一下：

```bash
curl -s -X POST http://127.0.0.1:8787/login \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"alice-pass"}'

# 复制上面返回的 access_token，然后：
curl -s http://127.0.0.1:8787/me -H "Authorization: Bearer <粘贴 token>"
curl -si http://127.0.0.1:8787/me            # 不带 token，看 401 + WWW-Authenticate
```

## 三种「让 token 失效」的方案

这是 Q2 的完整答案，代价各不相同：

| 方案 | 生效范围 | 代价 |
| --- | --- | --- |
| `jti` 黑名单 | 单个 token | 每次请求多一次查询；条目必须保留到该 token 的 `exp` 才能删 |
| `tokenVersion` | 该用户全部 token | 每次请求查一次用户；适合「改密码 / 封号 / 全部设备下线」 |
| 短 TTL + refresh token | 最多 TTL 秒 | 需要刷新流程（L3），但让 access token 真正无状态 |

注意：黑名单放内存，进程一重启就没了——生产要放 Redis，并设置 TTL = token 剩余寿命。

## 「claim 是快照」

`/admin` 刻意读 token 里的 `role`。后台把 bob 升为 admin 后，他手里的旧 token 仍然写着 `role=user`，直到重新登录。这是 JWT 用「无状态」换来的延迟一致性。

反过来，`/me` 的用户名从 DB 读：token 里即使有 `name`，也不应该拿它当权威数据（改名后就不对了）。

## 留给你的问题（在对话里回答，答完进 L3）

- **Q1** `/me` 和 `/admin` 一个查 DB、一个读 token，为什么不统一？各自的风险是什么？
- **Q2** 黑名单条目什么时候可以删？如果永远不删会怎样？
- **Q3** access token 设 60 秒，用户每 1 分钟被踢一次；设 7 天，登出又形同虚设。怎么同时要安全和体验？
