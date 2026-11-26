# Learning

一个学习工作区，两件事放在一起：

| 目录 | 内容 |
| --- | --- |
| `wiki/` | 个人 Wiki（VitePress）：概念、结论、坑，按主题组织 |
| `jwt-lab/` | JWT 课程代码：零依赖 Node 实验，按课次组织 |

## Wiki

```bash
cd wiki
./dev        # http://127.0.0.1:5173
```

`./dev` 会调用运行时自带的 Node + pnpm，不依赖全局 PATH。第一次运行前需要 `./install`。

新增主题：在 `wiki/docs/` 下建目录，写 `.md`，侧边栏和搜索会自动收录；目录标题在 `wiki/docs/.vitepress/config.mts` 的 `SECTION_TITLES` 里补一行。

## 课程

```bash
cd jwt-lab
./run l1/01-anatomy.mjs
```

## 约定

- 概念写进 `wiki/docs/<主题>/`，实验代码写进 `jwt-lab/lN/`；课程 README 只讲步骤，概念链接到 Wiki。
- 每完成一课提交一次；commit 信息带 `l1` / `l2` 或 `docs(jwt)` 前缀。
