# JWT 实验课：从签名到鉴权

按课次推进：每课先给结论，再给能跑的代码，最后留几道要自己回答的问题。全程零第三方依赖，只用 Node 内置模块，目的是看清库到底替你做了什么。

## 课程安排

| 课 | 主题 | 状态 |
| --- | --- | --- |
| L1 | 三段结构、手写 HS256、篡改与 `alg=none` | ✅ 已完成 |
| L2 | claims 校验、登录/鉴权中间件、401/403、吊销 | ✅ 代码完成，课后问题待答 |
| L3 | 刷新令牌与轮换、静默刷新、登出的完整流程 | ⏳ |
| L4 | 客户端存储：httpOnly Cookie vs localStorage、CSRF/XSS | ⏳ |
| L5 | HS256 vs RS256/ES256、JWKS、`kid`、密钥轮换、服务间互验 | ⏳ |
| L6 | 攻击面清单、OIDC、机器身份（agent 访问后台服务） | ⏳ |

## 目录

概念与结论整理在 [Wiki](../wiki/docs/index.md) 里；本目录只保留实验代码与步骤。

```
lib/jwt.mjs        手写 HS256 签发/验签（所有课共用）
l1/                解剖三段 + 篡改 + alg=none + 签名≠可用
l2/                真实服务端：五道鉴权关 + 吊销
```

## 运行约定

实验脚本要求 `node` 在 PATH 里（`node -v` 有输出即可）：

```bash
node l1/01-anatomy.mjs
node l2/server.mjs
node l2/test.mjs
```

## 说明

- 所有 secret 都是演示用的硬编码值，**不要**复制到真实项目。
- 手写实现只用于理解原理；生产环境用 `jose`（推荐）或 `jsonwebtoken`。
- 每完成一课，代码会提交一次，commit 信息里带 `l1` / `l2` 前缀。
