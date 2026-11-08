# 上传到 GitHub

这个目录就是准备上传的仓库内容，已经排除了 `node_modules/`、`dist/`、`.env.local` 等本地产物。

## 方式 A：网页拖拽（最省事）

1. GitHub 右上角 **New repository**，填名字（例如 `telecom-traffic-bi`），不要勾 README / .gitignore / license。
2. 进入空仓库，点 **uploading an existing file**。
3. 把本目录（`上传/`）里的**所有文件和文件夹**拖进去；不要拖 `上传` 这一层文件夹本身。
4. Commit message 填 `feat: telecom traffic BI frontend`，点 **Commit changes**。
5. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
6. 之后每次 push 到 `main`，`.github/workflows/deploy.yml` 会自动构建并发布到 `https://<用户名>.github.io/<仓库名>/`。

## 方式 B：命令行（推荐，后续好维护）

先在 GitHub 建空仓库，然后在**本目录**执行：

```bash
cd 上传

git init
git add .
git commit -m "feat: telecom traffic BI frontend"
git branch -M main

git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果本机还没有 git 身份：

```bash
git config user.name "你的名字"
git config user.email "你的邮箱"
```

## 上传后检查

```bash
cd web
pnpm install
pnpm dev          # http://127.0.0.1:5178
```

或者直接双击仓库根目录的 `启动演示.bat`。

## 说明

- `web/public/data/dataset.json` 和 `web/public/geo/china.json` 已经提交，拉下来不用跑 Python 就能看。
- 想重新生成模拟数据：`python data/gen_data.py`（只用标准库）。
- 接真实后端：看 `docs/接口契约-v1.md`，在 `web/.env.local` 里切 `VITE_DATA_MODE=api`。
- 改代码前先看 `docs/接手说明.md`，尤其是 ECharts 的 `shallowRef` / `watch` / `replaceMerge` 三个约定。
