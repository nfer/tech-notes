# 技术笔记

按主题整理：概念、结论和坑记在 Wiki 里，每个主题的实验代码单独一个目录。

| 路径 | 内容 |
| --- | --- |
| `wiki/` | 按主题组织的 Wiki（VitePress） |
| `jwt-lab/` | JWT 主题的零依赖 Node 实验，按课次组织 |

## Wiki

```bash
cd wiki
pnpm install   # 首次
./dev          # 默认 5173；端口被占用会自动顺延，以终端输出为准
```

`./dev`、`./build`、`./check` 要求 PATH 里有 `node`（nvm / Homebrew 均可），找不到直接退出。node 不在 PATH 里时，用 `NODE_BIN` 指定它的路径。

## 课程

```bash
cd jwt-lab
node l1/01-anatomy.mjs
```

## 约定

- 概念写进 `wiki/docs/<主题>/`，实验代码放在对应的 lab 目录；课程 README 只讲步骤，概念链接到 Wiki。
- 每完成一课提交一次；commit 信息带 `l1` / `l2` 或 `docs(jwt)` 前缀。
