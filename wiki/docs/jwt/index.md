---
title: JWT 鉴权
order: 1
---

# JWT 鉴权

从「登录鉴权」出发，把 JWT 的结构、传输、会话语义和密钥管理一层层补齐。配套代码在仓库的 `jwt-lab/` 下，写法约定见 [使用说明](/guide)。

## 笔记

- [**三段结构**](/jwt/structure) — `header.payload.signature` 各装了什么，签名到底签了哪些字节
- [**claims 与校验**](/jwt/claims) — claim 是什么、七个注册名、校验顺序
- [**HTTP 授权与 Bearer**](/jwt/http-auth) — `Authorization` 头、持有即授权的含义、401/403
- [**登录语义与吊销**](/jwt/login-semantics) — 多设备各自独立，登出为什么要加状态

## 配套实验

```bash
cd jwt-lab
./run l1/01-anatomy.mjs
```

## 待补主题

- 刷新令牌与轮换、静默续期
- 客户端存储：httpOnly Cookie vs localStorage
- 非对称签名、JWKS、`kid` 与密钥轮换
- 攻击面清单与 OIDC
