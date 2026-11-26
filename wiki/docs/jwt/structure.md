---
title: JWT 三段结构
order: 1
description: header.payload.signature 各装了什么，签名到底签了哪些字节
tags: [jwt, jws, base64url]
lesson: L1
updated: 2026-11-26
---

# JWT 三段结构

> 一句话：JWT 是 `base64url(header).base64url(payload).base64url(signature)`，签名只覆盖前两段，且默认**不加密**。

## 三个部分

| 段 | 装什么 | 典型字段 | 谁生成 |
| --- | --- | --- | --- |
| header | 元数据 | `alg`、`typ`、`kid` | 签发方 |
| payload | claims（声明） | `sub`、`exp`、`iat`、`aud`、`iss`、`jti` | 签发方 |
| signature | 签名值 | 二进制签名的 base64url | 签发方（持有密钥） |

三段都用 **base64url** 编码：把 base64 里的 `+` `/` 换成 `-` `_`，并去掉末尾的 `=` 填充。目的是让 token 能安全地放进 URL、Header、Cookie，且不含分隔符 `.`。

base64url 是**编码**，不是加密——任何人拿到 token 都能解开看内容。所以 payload 里不要放密码、身份证号这类东西，放一个 `sub`（用户 id）就够了。

## 签名到底签了什么

签名的输入**就是前两段字符串用 `.` 直接拼起来**，不重新序列化、不重新编码：

```js
const input = `${headerB64}.${payloadB64}`
const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url')
const token = `${input}.${signature}`
```

这带来两个直接推论：

1. 哪怕在 payload 的 JSON 里加一个空格，`payloadB64` 变了，签名就对不上。所以「改内容 → 重新编码 → 复用旧签名」一定失败。
2. 签名段本身**不在签名范围内**。它是校验值，不是被校验的内容。

## 签名 ≠ 加密

- **JWS**（RFC 7515）：签名，防篡改。`xxx.yyy.zzz` 三段就是 JWS 紧凑序列化。
- **JWE**（RFC 7516）：加密，防偷看，五段。
- JWT 本身（RFC 7519）只定义 claims 的语义；日常说的「JWT」几乎都是 **JWS 签名的 JWT**。

传输中的机密性由 TLS 保证，token 里的机密性靠「不放敏感信息」保证。需要端到端加密时才用 JWE，绝大多数 Web 登录用不到。

## 配套实验

```bash
cd jwt-lab
./run l1/01-anatomy.mjs   # 打印三段、签名输入、正确/错误 secret 的验签结果
```

## 常见误区

- ❌ payload 是加密的 → 只是 base64url，谁都能读。
- ❌ 签名段也被签名了 → 签名只覆盖 `header.payload`。
- ❌ 验签通过就能用 → 验签只证明「没被改、是我签的」，过期/受众/吊销要另外查。
- ❌ `alg` 可以信 token 自己写的 → 算法必须由服务端白名单决定，否则 `alg: none` 直接伪造。

## 自测

<details>
<summary>1. 在 payload 里加一个空格，签名会变吗？为什么？</summary>

会。签名输入是编码后的字符串，空格会进入 JSON，改变 `payloadB64`，HMAC 结果自然不同。
</details>

<details>
<summary>2. 为什么 HS256 的签名段解码后固定是 32 字节？</summary>

因为 HMAC-SHA256 的输出固定是 256 bit = 32 字节，签名段只是这 32 字节的 base64url 表示。
</details>

<details>
<summary>3. payload 明文可读，为什么还算安全？</summary>

安全性不来自「看不见」，而来自「改不了 + 伪造不了」：没有 secret 就无法生成匹配的签名。机密性靠不放敏感数据 + TLS。
</details>
