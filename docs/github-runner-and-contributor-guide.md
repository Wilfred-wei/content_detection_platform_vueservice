# Runner 注册与协作指南

本文说明如何把当前服务器注册为 GitHub Actions self-hosted Runner，以及新合作者如何加入项目。

仓库地址：

`git@github.com:Wilfred-wei/content_detection_platform_vueservice.git`

当前部署分支：`agent-detection-current`

## 一、注册本机 Runner

### 1. 确认网络和用户

Runner 不需要公网 IP，但服务器必须能主动访问 GitHub 的 HTTPS 服务。用部署用户执行：

```bash
id
curl -fsSI --max-time 10 https://github.com
uname -m
```

如果服务器通过代理上网，要让 Runner 服务继承 `HTTPS_PROXY`、`HTTP_PROXY` 和 `NO_PROXY` 配置。

### 2. 在 GitHub 创建 Runner

使用有仓库管理权限的账号打开：

`Repository -> Settings -> Actions -> Runners -> New self-hosted runner`

选择 Linux、x64。页面会显示与当前 Runner 版本匹配的下载、解压和注册命令。标签输入框可能不会出现在这个页面，先不要停在这里找标签；注册时用下面的方式加入自定义标签 `agent-deploy`。不要把 registration token 写进文档、聊天记录或脚本。

### 3. 在当前服务器执行

Runner 目录必须与在线项目目录分开。下面的目录只是建议值：

```bash
mkdir -p /sda/home/temp/weiwenfei/actions-runner-agent
cd /sda/home/temp/weiwenfei/actions-runner-agent
```

然后把 GitHub 页面中的下载、校验和解压命令原样粘贴到这里。执行注册命令时，在末尾追加 `--labels agent-deploy`，例如：

```bash
./config.sh --url https://github.com/Wilfred-wei/content_detection_platform_vueservice --token <GitHub 页面生成的临时 token> --labels agent-deploy
```

其中 `<GitHub 页面生成的临时 token>` 只替换为页面显示的值，不要把它提交或发到聊天中。注册时确认：

- Runner name 使用容易识别的名字，例如 `weiwenfei-agent-server`
- Labels 包含 `agent-deploy`
- Runner group 使用仓库允许的默认组或专用组
- 工作目录不要指向 `/sda/home/temp/weiwenfei/content_detection_platform_vueservice-master`

配置完成后先前台验证：

```bash
cd /sda/home/temp/weiwenfei/actions-runner-agent
./run.sh
```

看到 `Listening for Jobs` 后，在 GitHub 的 Runner 页面确认状态为 `Idle`。验证完成后按 `Ctrl+C` 停止前台进程。

如果 Runner 已经注册但没有这个标签，可以在 `Settings -> Actions -> Runners` 中找到该 Runner，点击右侧 `...`，选择 `Edit labels`，添加 `agent-deploy`。不同 GitHub 页面布局可能把编辑入口放在 Runner 名称详情页的 `Labels` 区域。

### 4. 配置常驻服务

推荐用 GitHub Runner 自带的 service 脚本，让服务器重启后自动恢复：

```bash
cd /sda/home/temp/weiwenfei/actions-runner-agent
sudo ./svc.sh install weiwenfei
sudo ./svc.sh start
sudo ./svc.sh status
```

如果没有 sudo 权限，可以暂时使用 `tmux` 或 `screen` 运行 `./run.sh`，但这不是长期方案。服务运行用户必须能读写 Runner 目录和项目部署目录，并能执行 Node、npm、Python、uv、rsync 和项目脚本。

当前服务器采用账号级 `systemd --user` 服务，避免依赖 sudo。服务文件位于：

`~/.config/systemd/user/content-detection-agent-runner.service`

服务内容需要把 `WorkingDirectory` 和 `ExecStart` 指向 Runner 目录，并保留服务器的出站代理环境。启用命令为：

```bash
systemctl --user daemon-reload
systemctl --user enable --now content-detection-agent-runner.service
systemctl --user status content-detection-agent-runner.service
```

如果希望用户退出登录后仍自动启动，需要管理员为该账号开启 user lingering；没有管理员权限时，保持服务器用户会话或使用管理员安装 `svc.sh`。

### 5. 设置仓库变量

在 `Repository -> Settings -> Secrets and variables -> Actions -> Variables` 添加：

| 变量 | 当前服务器建议值 | 用途 |
| --- | --- | --- |
| `AGENT_DEPLOY_ROOT` | `/sda/home/temp/weiwenfei/content_detection_platform_vueservice-master` | 在线项目目录 |
| `AGENT_DEPLOY_RESTART_COMMAND` | 暂不设置 | 服务管理器准备好后再设置 |
| `AGENT_DEPLOY_HEALTH_URL` | 暂不设置 | 后端服务常驻后再设置，例如 `http://127.0.0.1:8020/health` |
| `AGENT_DEPLOY_REQUIRE_RESTART` | `false` | 未配置服务重启前保持 `false` |

API key、模型路径、C2PA trust anchor 和分析数据放在服务器本地 `.env` 或受管存储中，不要放进这些变量，也不要提交到 GitHub。

## 二、保护部署分支

self-hosted Runner 能访问本机文件和服务，不能让未经审核的 PR 代码直接在它上面执行。请在 GitHub 设置：

1. `Settings -> Branches -> Add branch protection rule`
2. 保护 `agent-detection-current`
3. 开启 `Require a pull request before merging`
4. 开启 `Require status checks to pass before merging`
5. 将 `Frontend build and contract`、`Detection Agent tests and build`、`Python syntax and UV worker tests` 设为必需检查
6. 限制谁可以直接 push 到该分支，普通合作者只通过 PR 合并
7. 在 `Settings -> Actions -> Runner groups` 中只允许本仓库使用 `agent-deploy` Runner

部署 job 只在推送到 `agent-detection-current` 后运行，PR 和普通测试 job 使用 GitHub 托管 Runner。合作者的代码必须先通过 PR 审核，才可能触发本机部署。

## 三、邀请合作者

有仓库管理权限的账号打开：

`Settings -> Collaborators -> Add people`

建议权限：

- `Write`：日常开发、创建分支、提交 PR
- `Maintain`：维护 Actions、分支保护和仓库设置的少数负责人
- `Admin`：只给项目所有者

普通合作者不需要服务器 SSH 权限，也不需要 Runner 注册权限。模型权重、API 密钥和生产 `.env` 不通过 GitHub 协作权限共享。

## 四、合作者本地开发

```bash
git clone git@github.com:Wilfred-wei/content_detection_platform_vueservice.git
cd content_detection_platform_vueservice
git switch -c feature/<short-name> agent-detection-current
```

前端：

```bash
cd frontend
npm ci
npm run test:agent-contract
npm run build
```

Detection Agent：

```bash
cd services/detection_agent_service
npm ci
npm run test:ci
npm run build
```

`npm run test:ci` 是不依赖本机 C2PA 样例图片和本地 `c2patool` 二进制的可移植测试集，适合在 GitHub Actions 中运行。若已准备好这些不入库的本地资源，可以额外运行完整的 `npm test`。

CPU image-view worker：

```bash
uv sync --project services/detection_agent_service/workers/image_views --frozen
uv run --project services/detection_agent_service/workers/image_views --frozen --no-sync python -m unittest discover -s services/detection_agent_service/workers/image_views/tests
```

提交前确认：

```bash
git diff --check
git status --short
```

## 五、提交和部署流程

1. 从 `agent-detection-current` 创建 `feature/*` 分支。
2. 在本地完成测试并推送 feature 分支。
3. 创建 PR，等待 CI 通过和代码审核。
4. 合并到 `agent-detection-current` 后，CI 通过才会进入本机部署 job。
5. 在服务器页面、健康检查和日志中确认部署结果。
6. 需要生产发布时，再由负责人将已验证提交合并到受保护的 `master`。

不要直接把实验代码、模型权重、`.env` 或大数据集提交到部署分支。若只是查看 CI，不要手动重跑 deploy；手动 deploy 只由负责人使用。

## 六、常见问题

### Runner 显示 Offline

检查 Runner service 状态、服务器出站 HTTPS、代理配置和系统时间。GitHub 不需要连接服务器的入站端口。

### Job 一直 Queued

检查 Runner 是否为 `Idle`，labels 是否同时包含 `self-hosted`、`linux`、`x64`、`agent-deploy`，以及 Runner group 是否允许该仓库。

### 部署 job 找不到目录

确认 `AGENT_DEPLOY_ROOT` 指向已有 Git checkout，并且 Runner 用户有读写权限。Runner 工作目录不能和在线项目目录相同。

### 测试通过但页面没有变化

当前前端仍是 Vite 开发进程，Agent 后端也还没有统一的 systemd/Docker 管理。部署脚本会同步并构建代码，但不会默认杀掉现有进程。完成服务化后，再配置 `AGENT_DEPLOY_RESTART_COMMAND` 和 `AGENT_DEPLOY_HEALTH_URL`。
