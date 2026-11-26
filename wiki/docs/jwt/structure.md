---
title: JWT 三段结构
order: 1
description: header.payload.signature 各装了什么，签名输入与 HMAC-SHA256
tags: [jwt, jws, base64url, hmac]
lesson: L1
updated: 2026-11-26
---

# JWT 三段结构

> 一句话：JWT 是 `base64url(header).base64url(payload).base64url(signature)`，签名只覆盖前两段，且默认**不加密**。

## 三个部分

| 段 | 装什么 | 典型字段 |
| --- | --- | --- |
| header | 元数据 | `alg`、`typ`、`kid` |
| payload | claims（声明） | `sub`、`exp`、`iat`、`aud`、`iss`、`jti` |
| signature | 签名值 | 签名算法输出的 base64url |

三段都用 **base64url** 编码：把 base64 里的 `+` `/` 换成 `-` `_`，并去掉末尾的 `=` 填充。目的是让 token 能安全地放进 URL、Header、Cookie，且不含分隔符 `.`。

base64url 是**编码**，不是加密——任何人拿到 token 都能解开看内容。所以 payload 里不要放密码、身份证号这类东西，放一个 `sub`（用户 id）就够了。

## 签名到底签了什么

签名的输入**就是前两段字符串用 `.` 直接拼起来**，不重新序列化、不重新编码：

```js
const input = `${headerB64}.${payloadB64}`
```

这带来两个直接推论：

1. 哪怕在 payload 的 JSON 里加一个空格，`payloadB64` 变了，签名就对不上。所以「改内容 → 重新编码 → 复用旧签名」一定失败。
2. 签名段本身**不在签名范围内**。它是校验值，不是被校验的内容。

## 签名怎么算：HMAC 与 HS256

对上面拼出来的 `input`，HS256 的算法是 `HMAC-SHA256(input, secret)`。名字拆开看：

| 部分 | 含义 |
| --- | --- |
| **HMAC** | 带密钥的哈希（Keyed-Hash Message Authentication Code），不是普通 hash |
| **SHA-256** | HMAC 内部用的哈希函数，输出固定 256 bit = 32 字节 |
| **HS** | HMAC + SHA 的缩写，`HS256` 就是 HMAC-SHA256 |

HMAC 和普通 hash 的唯一区别是**它需要一把密钥**：同一个输入、同一把 secret，结果永远一样；换一把 secret，结果完全不同；没有 secret，算不出正确签名。

```js
// HS256：HMAC-SHA256(input, secret)
const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url')
const token = `${input}.${signature}`
```

这正好覆盖 JWT 需要的三件事：

- 改一个字节 → 结果全变（防篡改）；
- 没有 secret → 伪造不出来（防伪造）；
- 验证方拿同一把 secret 重算一遍就能比对（服务端不用存 token）。

## 签名不是加密

你现在看到的 `header.payload.signature` 三段，是 **JWS**（JSON Web Signature）的紧凑格式，它只做签名，不做加密。规范里还有一种 **JWE**（JSON Web Encryption），把 payload 加密后再传输；它的紧凑格式是**五段**，验证方必须先解密才能读到 claims。

| | JWS | JWE |
| --- | --- | --- |
| 段数 | 3 | 5 |
| 作用 | 防篡改 | 防篡改 + 防偷看 |
| 谁能读 payload | 任何人 | 持有解密密钥的人 |
| Web 登录 | 基本都用它 | 极少用 |

为什么不默认加密？加密会让**每一个验证方都要能解密**，密钥分发和轮换的复杂度陡增；而传输中的机密性已经由 TLS 解决，token 里本来也不该放秘密。只有需要「连网关、日志都不能看到内容」的端到端场景，才轮到 JWE。

> JWT（RFC 7519）只定义 claims 的语义；JWS（RFC 7515）和 JWE（RFC 7516）定义怎么把它装起来。日常说的 JWT，几乎都是 JWS 形式。

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
