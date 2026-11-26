---
title: JWT 鉴权
order: 0
---

# JWT 鉴权

从「登录鉴权」出发，把 JWT 的结构、传输、会话语义和密钥管理一层层补齐。配套代码在仓库的 `jwt-lab/` 下。

## 笔记

- [**三段结构**](/jwt/structure) — `header.payload.signature` 各装了什么，签名到底签了哪些字节

## 这套 Wiki 怎么用

- 每篇开头一句话结论，先看结论再看细节；
- 关键结论对应 `jwt-lab/` 里能跑的脚本，建议先预测再运行；
- 「常见误区」比正文更值得看，那是最容易记反的地方。

## 配套实验

```bash
cd jwt-lab
./run l1/01-anatomy.mjs
```

## 待补主题

- claims 校验：`exp` / `nbf` / `aud` / `iss` 与时钟偏移
- 刷新令牌与轮换、静默续期
- 客户端存储：httpOnly Cookie vs localStorage
- 非对称签名、JWKS、`kid` 与密钥轮换
- 攻击面清单与 OIDC
