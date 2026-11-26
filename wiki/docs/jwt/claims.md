---
title: claims 与校验
order: 2
description: claim 是什么、七个注册名，以及服务端按什么顺序校验它们
tags: [jwt, claims, rfc7519]
updated: 2026-11-26
---

# claims 与校验

> 一句话：claim 是签发方对主体的**声称**，不是事实；服务端必须先验签，再按 `exp`、`nbf`、`aud`、`iss` 的顺序判断这些声称能不能用。

## claim 是什么

RFC 7519 的术语表给的定义是：

> A piece of information asserted about a subject.

`asserted` 是「声称、断言」。所以 claim 不是「字段」的花哨说法，它强调**这是签发方单方面做出的声称**：声称这张票代表谁、声称他是什么角色、声称它什么时候过期。

声称不等于事实。签发方说这个票的角色是 `admin`，服务端可以照单全收，也可以回查数据库——这个选择就是「读 claim 还是查数据库」那类权衡的语言基础。

一个 claim 是「名字 + 值」的键值对，所有 claim 组成 JWT Claims Set，也就是 token 的第二段。

## 七个注册名

JWT 标准预定义了七个可互操作的注册名（registered claim names）。它们的共同点是**名字都很短**：

| 短名 | 全称 | 含义 |
| --- | --- | --- |
| `iss` | Issuer | 签发方 |
| `sub` | Subject | 主体，即这张票说的是谁 |
| `aud` | Audience | 接收方，即这张票发给谁 |
| `exp` | Expiration Time | 过期时刻，到这个时间起必须拒绝 |
| `nbf` | Not Before | 生效时刻，早于这个时间必须拒绝 |
| `iat` | Issued At | 签发时刻 |
| `jti` | JWT ID | 这张票的唯一标识 |

短是有意为之，RFC 的原话是：

> All the names are short because a core goal of JWTs is for the representation to be compact.

这七个都是可选的，用不用由应用自己定。除它们之外，应用可以自由添加 claim（比如 `role`、`scope`、`tenant`），只要不覆盖上面七个注册名的含义。

## 校验顺序

验签和读 claim 之间有严格的先后：**没验签就解出的 claim，等同于攻击者直接写给你的输入**。

1. **验签 + 算法白名单**：签名不对、或者 `alg` 不在允许列表里，直接拒绝。这一关之前，claim 一个字都不能信。
2. **`exp` / `nbf`**：当前时间必须早于 `exp`、晚于或等于 `nbf`。
3. **`aud` / `iss`**：这张票是不是签给我的、是谁签的。RFC 明确要求：如果参与处理的实体不在 `aud` 列表里，**必须拒绝**。
4. **应用级状态**：`jti` 是否在吊销名单里、用户版本号是否过期。
5. **授权**：身份确认后，判断角色或 scope 够不够。

前三关不过通常是 401（凭证无效），第五关不过才是 403（身份有效但没权限）。

## 时间类 claim 的两个细节

**`exp` 是「到点即失效」，不是「宽限到点之后」。** RFC 的措辞是 `on or after which`——时间等于 `exp` 的那一刻起就不能再接受。判断条件写成 `now >= exp` 才对，写成 `now > exp` 会多放行一秒。

**时钟偏移要留余量。** 签发方和验证方的时钟不会完全一致，RFC 允许实现者给「几分钟以内」的小余量（leeway）来容纳偏差。留多少取决于部署环境，但必须显式设一个值，而不是隐式依赖本机时间。

`iat` 不参与准入判断，只用来算年龄（比如「这个 token 是三天前签的」），有些系统用它做「密码修改后签发的 token 才有效」这类判断。

## 配套实验

```bash
cd jwt-lab
./run l2/test.mjs
```

覆盖了签名被篡改、`alg=none`、`aud` 不符、已过期四种拒绝路径，以及它们各自返回的错误码。

## 常见误区

- ❌ 先解 claim 再验签 → 等于把攻击者的输入当事实。
- ❌ 只查 `exp`，不查 `aud` → A 服务签的票能打 B 服务。
- ❌ 把 claim 当实时数据 → 用户被降级后，旧票里的 `role` 仍是旧值，直到过期。
- ❌ `exp` 用毫秒 → 注册名的值约定是 NumericDate，单位是秒，写成毫秒会让票瞬间过期或几十年不过期。
- ❌ 忽略 `nbf` → 提前签发的票会被立刻接受。

## 自测

<details>
<summary>1. 为什么必须先验签再读 claim？</summary>

因为 claim 段是明文，任何人都能改。没验签之前，`sub` 和 `role` 可能是攻击者随手写的，读出来再拿去用就是信任不可信输入。
</details>

<details>
<summary>2. `aud` 到底防的是什么？</summary>

防「张冠李戴」：A 服务签给 A 的票，被拿去请求 B 服务。B 只要检查 `aud` 里有没有自己，这类越权就直接被拒。
</details>

<details>
<summary>3. `exp` 判断写成 `now > exp` 和 `now >= exp` 有区别吗？</summary>

有。RFC 要求「到 `exp` 那一刻起」就不能接受，`now >= exp` 才是正确的边界；`now > exp` 会多放行整整一秒。
</details>
