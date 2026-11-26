---
title: HTTP 授权与 Bearer
order: 4
description: Authorization 头、Bearer 的「持有即授权」、其他 scheme 与 401/403
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
- credentials 的格式由 scheme 自己定义，JWT 只是 Bearer 的一种凭证。

## Bearer 是什么

RFC 6750 定义。英文 bearer 是「持票人」——像现金或无记名债券，谁拿着算谁的。服务端只检查票真不真、过期没、有没有权限，**不要求你证明「票是你本人申请的」**。

OAuth 2.0 的 token 响应里有个 `token_type` 字段（RFC 6749 §5.1），就是告诉客户端「这个 token 该用哪种 scheme 发」。

由此得到一条推论：**token 泄露 = 身份泄露**，没有第二道验证。

## 在 HTTP 里怎么放

- **Header（首选）**：`Authorization: Bearer <token>`。必须走 HTTPS，且不要把 token 放进 URL、日志、Referer 能带出去的地方。
- **Query / 表单**：RFC 6750 允许，但明确不推荐——会进访问日志、浏览器历史、代理缓存。
- **Cookie**：另一种载体。`HttpOnly` 让页面脚本读不到它，`SameSite` 控制跨站请求是否携带，两者都关系 CSRF（跨站请求伪造）的防护，具体取舍属于客户端存储的问题。

## 401 与 403

| 状态码 | 含义 | 响应头 |
| --- | --- | --- |
| 401 | 没认证，或凭证无效（没带 token、签名错、过期） | 必须带 `WWW-Authenticate`（`error="invalid_token"`） |
| 403 | 认证过了，但没权限（角色不够、scope 不足） | 可带 `WWW-Authenticate`（`error="insufficient_scope"`） |

`WWW-Authenticate` 是响应头，告诉客户端该用哪种认证方式、以及失败原因：

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="expired"
```

客户端据此决定下一步动作——提示重新登录、或按 `error` 码做不同处理，而不是盲目重试。

## 常见误区

- ❌ Bearer 是加密的 → 只是「怎么带」，token 本身仍是明文 JWT。
- ❌ 401 和 403 随便用 → 语义不同，客户端的后续动作也不同。

## 自测

<details>
<summary>1. 为什么说 Bearer 像「现金」而不是「记名票据」？</summary>

因为服务端只验票的真伪与权限，不核验持有者身份。拿到票的人就能用，所以泄露即失窃。
</details>

<details>
<summary>2. 客户端收到 401 和 403 时，合理的动作分别是什么？</summary>

401：提示重新登录；403：不要重试，提示无权限或隐藏入口，因为身份是有效的。
</details>

## 附录：其他 Authorization scheme

HTTP 认证 scheme 注册表中与 API 相关的几种：

| Scheme | 含义 | 规范 | 典型场景 |
| --- | --- | --- | --- |
| `Bearer` | 持有即授权 | RFC 6750 | OAuth2 access token、API，实际上的通用做法 |
| `Basic` | `base64(user:password)` | RFC 7617 | 简单 API；每个请求都带密码，必须 TLS |
| `Digest` | 挑战—响应式摘要 | RFC 7616 | 基本淘汰 |
| `Negotiate` | Kerberos / SPNEGO | RFC 4559 | 企业内网 SSO |
| `DPoP` | 持有 + 私钥持有证明 | RFC 9449 | 防 token 被盗后重放，机器身份 |
| `AWS4-HMAC-SHA256` | 请求签名 | AWS 自定义 | AWS API |
