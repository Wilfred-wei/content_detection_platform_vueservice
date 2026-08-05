# 合作者协作手册

本文面向只参与代码开发的合作者。合作者不需要登录部署服务器，也不需要注册
self-hosted Runner。代码通过 GitHub 分支和 Pull Request（PR）共享，合并后由
GitHub Actions 自动测试，并在测试通过后部署到服务器。

仓库地址：

`git@github.com:Wilfred-wei/content_detection_platform_vueservice.git`

默认开发基线：`agent-detection-current`

## 1. 加入项目

项目负责人在 GitHub 仓库中打开：

`Settings -> Collaborators -> Add people`

邀请合作者的 GitHub 账号。日常开发通常授予 `Write` 权限即可。合作者接受邀请
后，确认自己能打开仓库主页和 Actions 页面。

推荐使用 SSH 连接 GitHub：

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
cat ~/.ssh/id_ed25519.pub
```

把公钥添加到 GitHub：

`Settings -> SSH and GPG keys -> New SSH key`

然后验证：

```bash
ssh -T git@github.com
```

如果团队统一使用 HTTPS，也可以把下面的仓库地址替换为
`https://github.com/Wilfred-wei/content_detection_platform_vueservice.git`。

## 2. 拉取代码并创建分支

每个任务使用独立分支，不直接在 `agent-detection-current` 上开发：

```bash
git clone git@github.com:Wilfred-wei/content_detection_platform_vueservice.git
cd content_detection_platform_vueservice
git fetch origin agent-detection-current
git switch -c feature/<short-name> --track origin/agent-detection-current
```

例如：

```bash
git switch -c feature/explanation-report --track origin/agent-detection-current
```

开始新任务前同步基线：

```bash
git switch agent-detection-current
git pull --ff-only origin agent-detection-current
git switch feature/<short-name>
git rebase agent-detection-current
```

## 3. 本地开发和测试

### 前端

```bash
cd frontend
npm ci
npm run test:agent-contract
npm run build
```

### Detection Agent

```bash
cd services/detection_agent_service
npm ci
npm run test:ci
npm run build
```

`npm run test:ci` 是不依赖本机 C2PA 样例图片和本地 `c2patool` 二进制的可移植
测试集。准备好这些本地资源后，可以额外运行完整的 `npm test`。

### CPU image-view worker

项目使用 UV 管理这个 worker 的 Python 环境：

```bash
uv sync --project services/detection_agent_service/workers/image_views --frozen
uv run --project services/detection_agent_service/workers/image_views \
  --frozen --no-sync python -m unittest discover \
  -s services/detection_agent_service/workers/image_views/tests
```

提交前至少执行：

```bash
git diff --check
git status --short
```

## 4. 共享代码

代码共享使用 Git 分支和 PR，不要通过聊天工具发送压缩包，也不要直接改服务器
上的在线目录。

```bash
git add <changed-files>
git commit -m "Describe the change"
git push -u origin feature/<short-name>
```

在 GitHub 创建 Pull Request：

- `base` 选择 `agent-detection-current`
- `compare` 选择自己的 `feature/<short-name>`
- 描述改动内容、测试命令和已知限制
- 关联对应 Issue（如果有）

PR 合并前由负责人或指定 reviewer 审核。普通合作者不要直接 push
`agent-detection-current`；如确需紧急修复，也先和负责人确认。

## 5. 自动测试和部署

工作流文件是 `.github/workflows/agent-ci-cd.yml`。

### Pull Request 阶段

GitHub 托管 Runner 自动执行：

1. 前端契约测试和生产构建
2. Detection Agent 可移植测试和构建
3. Python 语法检查与 image-view worker 测试

PR 阶段不会执行服务器部署。三个检查全部变绿后，再等待代码审核和合并。

### 合并到部署分支后

合并到 `agent-detection-current` 会再次执行全部 CI。全部通过后，部署 job 会
使用服务器上的 self-hosted Runner（标签 `agent-deploy`）执行：

1. checkout 合并后的提交
2. 准备 Node.js 22.19
3. 安装依赖并构建前端和 Agent
4. 同步代码与构建产物到服务器在线目录

在仓库的 `Actions -> Agent CI/CD` 中查看运行结果。部署成功后，服务器目录的
`.deploy/revision` 会记录已部署的提交 SHA。

当前服务器没有配置自动重启命令，因此部署会同步代码和构建产物，但不会自动
重启正在运行的 Vite 或后端进程。进程服务化后，再由负责人配置重启和健康检查。

## 6. 不能提交的内容

以下内容只能保存在服务器本地或受管存储中：

- `.env`、API key、访问令牌和私钥
- 模型权重、虚拟环境和本地工具二进制
- 用户上传文件、运行时数据库和分析数据
- 未确认授权的大型数据集和商业素材

不要为了让 CI 通过而提交密钥或大文件。需要共享的新依赖、测试样例或模型文件，
先在 PR 描述中说明来源、许可证、大小和存放方案。

## 7. 常见问题

### PR 一直没有通过

打开失败的 job 查看具体步骤，在本地复现后提交修复并再次 push 到同一个 feature
分支。不要手动跳过必需检查。

### 合并后部署 job 显示 Queued

这通常表示 `agent-deploy` Runner 暂时离线或正在执行其他任务。联系项目负责人
检查仓库 `Settings -> Actions -> Runners`，合作者不需要重新注册 Runner。

### 部署成功但页面没有变化

先确认 Actions 的 deploy job 成功，再确认服务器进程是否已重启。当前部署默认不
重启服务；必要时联系负责人执行受控重启和健康检查。

### 需要回滚

不要直接在服务器修改文件。由负责人选择已验证的提交，使用 GitHub Actions 的
`workflow_dispatch` 按流程部署，或回滚 `agent-detection-current` 后重新通过 CI。

## 8. 最短工作流

```bash
git switch -c feature/<short-name> --track origin/agent-detection-current
# 修改代码并完成本地测试
git add <changed-files>
git commit -m "Describe the change"
git push -u origin feature/<short-name>
# GitHub 创建 PR，等待 CI 和 review，合并到 agent-detection-current
```
