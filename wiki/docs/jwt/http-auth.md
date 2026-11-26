---
title: HTTP 授权与 Bearer
order: 2
description: Authorization 头、Bearer 的「持有即授权」、其它 scheme 与 401/403
tags: [http, bearer, oauth2, rfc6750]
updated: 2026-11-26
---

# HTTP 授权与 Bearer

> 一句话：`Authorization: <scheme> <credentials>`；`Bearer` 的含义是**谁持有这张票，谁就是被授权的人**，不验证「你是不是被签发的那个人」。

## Authorization 头

格式由 RFC 9110（HTTP 语义，替代旧的 RFC 7235）定义：

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

- scheme 名大小写不敏感（`bearer` 也合法，习惯写 `Bearer`）；
- credentials 的格式由 scheme 自己定义，JWT 只是 Bearer 的一种凭证；
- 一个请求只能带一种 scheme。

## Bearer 是什么

RFC 6750 定义。英文 bearer 是「持票人」——像现金或无记名债券，谁拿着算谁的。服务端只检查票真不真、过期没、有没有权限，**不要求你证明「票是你本人申请的」**。

OAuth 2.0 的 token 响应里有个 `token_type` 字段（RFC 6749 §5.1），就是告诉客户端「这个 token 该用哪种 scheme 发」。

由此推出三条工程结论：

1. **token 泄露 = 身份泄露**，没有第二道验证；
2. 必须走 HTTPS，且不要把 token 放进 URL、日志、Referer 能带出去的地方；
3. access token 的 TTL 要短，配合刷新机制（见 [登录语义](/jwt/login-semantics)）。

## 其它 scheme

| Scheme | 含义 | 典型场景 |
| --- | --- | --- |
| `Bearer` | 持有即授权 | OAuth2 access token、API，事实标准 |
| `Basic` | `base64(user:password)` | 简单 API；每个请求都带密码，必须 TLS |
| `Digest` | 挑战—响应式摘要（RFC 7616） | 基本淘汰 |
| `Negotiate` | Kerberos / SPNEGO（RFC 4559） | 企业内网 SSO |
| `DPoP` | 持有 + 私钥持有证明（RFC 9449） | 防 token 被盗后重放，机器身份 |
| `AWS4-HMAC-SHA256` | 请求签名 | AWS API |

需要「偷了 token 也用不了」时，才需要 DPoP / mTLS 这类 **proof-of-possession** 方案。mTLS 不是 Authorization scheme，它工作在传输层。

## token 放哪里

- **Header（首选）**：`Authorization: Bearer <token>`，不污染 URL，不会被日志和 Referer 带出去。
- Query / 表单：RFC 6750 允许，但明确不推荐——会进访问日志、浏览器历史、代理缓存。
- Cookie：另一种载体，安全性取决于 `HttpOnly` / `SameSite`，属于 [客户端存储](/jwt/) 的话题。

## 401 与 403

| 状态码 | 含义 | 响应头 |
| --- | --- | --- |
| 401 | 没认证，或凭证无效（没带 token、签名错、过期） | 必须带 `WWW-Authenticate` |
| 403 | 认证过了，但没权限（角色不够、scope 不足） | 可带 `WWW-Authenticate: Bearer error="insufficient_scope"` |

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="expired"
```

这个头不只是装饰：客户端靠它区分「该去刷新 token」还是「该重新登录」，所以错误码要稳定、可枚举，别把内部异常直接扔出来。

## 常见误区

- ❌ Bearer 是加密的 → 只是「怎么带」，token 本身仍是明文 JWT。
- ❌ `token_type` 可以随便写 → OAuth2 里对 Bearer token 固定为 `Bearer`，自造值会让客户端不认。
- ❌ Basic 适合长期 API 凭证 → 每个请求都重放密码，泄露面比 token 大得多。
- ❌ 401 和 403 随便用 → 语义不同，客户端的重试/刷新逻辑也不同。

## 自测

<details>
<summary>1. 为什么说 Bearer 像「现金」而不是「记名票据」？</summary>

因为服务端只验票的真伪与权限，不核验持有者身份。拿到票的人就能用，所以泄露即失窃。
</details>

<details>
<summary>2. 客户端收到 401 和 403 时，合理的动作分别是什么？</summary>

401：尝试刷新 token，失败则跳登录；403：不要刷新，提示无权限或隐藏入口，因为身份是有效的。
</details>

<details>
<summary>3. 什么场景值得上 DPoP？</summary>

token 容易被窃取且后果严重时，比如浏览器外的机器身份、公开客户端；DPoP 要求每次请求用私钥签一个 proof，偷到 token 也重放不了。
</details>
