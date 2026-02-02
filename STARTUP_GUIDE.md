# AI旅拍本地启动指南（2026-02-02 更新）

本指南覆盖：后端 + 管理后台（同一套应用）以及微信小程序的本地启动；并包含 Coze 生成链路的配置与排查方式。

---

## 0. 前置要求

- Node.js 18+（建议 20+）
- pnpm 10+
- MySQL 8+
- 微信开发者工具（运行小程序）

---

## 1. 一键启动（推荐）

在 `ai_travel_program/` 目录执行：

```bash
bash start.sh
```

脚本会：
- 生成/引导初始化 `ai-travel-photo-app/.env`
- 安装依赖
- 执行 `pnpm run db:push`
- 启动 `pnpm run dev`

启动后：
- 管理后台：`http://localhost:3000/admin`
- API：`http://localhost:3000/api/trpc`

开发环境管理员快捷登录：
```
http://localhost:3000/api/dev/super-admin/login
```

---

## 2. 手动启动（后端 + 管理后台）

### 2.1 安装依赖

```bash
cd ai_travel_program/ai-travel-photo-app
pnpm install
```

### 2.2 配置环境变量

编辑 `ai_travel_program/ai-travel-photo-app/.env`（关键项）：

```env
PORT=3000
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/ai_travel
JWT_SECRET=your-secret

# 存储：local=本地；cloud=腾讯云 COS
STORAGE_TYPE=cloud
COS_SECRET_ID=...
COS_SECRET_KEY=...
COS_BUCKET=...
COS_REGION=ap-guangzhou
```

### 2.3 迁移数据库并启动

```bash
pnpm run db:push
pnpm run dev
```

---

## 3. 微信小程序启动

### 3.1 打开项目

用微信开发者工具打开：`ai_travel_program/wx-miniapp`

### 3.2 配置 API BaseUrl

在 `ai_travel_program/wx-miniapp/app.js` 设置：

```js
apiBaseUrl: 'http://localhost:3000'
```

### 3.3 关闭域名校验（开发阶段）

微信开发者工具：
`详情 → 本地设置 → 勾选“不校验合法域名、web-view、TLS 版本”`

---

## 4. 生成链路必读（Coze + 图片可访问性）

### 4.1 Coze 配置位置

本项目读取 Coze 配置优先级：
1) 数据库 `systemConfigs`（管理后台“系统配置”）  
2) `.env` 环境变量  

必须配置：
- `COZE_API_KEY`
- `COZE_SINGLE_FACE_WORKFLOW_ID`
- `COZE_DOUBLE_FACE_WORKFLOW_ID`
- `COZE_USER_ANALYZE_WORKFLOW_ID`

> 建议直接在管理后台“系统配置”里配置，方便热更新；服务端有 60 秒配置缓存。

### 4.2 存储建议

- `STORAGE_TYPE=local`：图片仅本机可见，Coze **无法**访问（真实生成大概率失败）
- `STORAGE_TYPE=cloud`：图片走 COS 公网 URL，Coze 才能拉取并执行工作流

---

## 5. Coze “返回空结果(info=null)”排查（重点）

如果小程序控制台出现类似：
`{ success: false, error: "...", executeId: "...", workflowId: "...", errorCode: "COZE_EMPTY_OUTPUT" }`

按下面顺序排查：

1) **拿到 executeId / workflowId**  
   - 小程序 `request.js` 会打印“解析后的结果”，里面包含 `executeId` / `workflowId`
2) **到 Coze 控制台查执行记录**  
   - 用 `executeId` 找到该次运行，查看每个节点输入输出（通常能看到：拉图失败/人脸检测失败/限流/额度等）
3) **用后台接口拉取执行历史（可选）**  
   - 先访问 `http://localhost:3000/api/dev/super-admin/login` 登录
   - 然后在浏览器 Console 执行（会携带 cookie）：
     ```js
     fetch('/api/trpc/admin.cozeRunHistory?input=' + encodeURIComponent(JSON.stringify({
       json: { workflowId: '你的workflowId', executeId: '你的executeId' }
     }))).then(r => r.json()).then(console.log)
     ```
4) **看 errorCode / retryable**  
   - `COZE_API_KEY_MISSING`：服务未配置（需要管理员配置）
   - `IMAGE_URL_UNREACHABLE`：图片 URL 无法访问（生成也大概率失败）
   - `COZE_EMPTY_OUTPUT`：工作流执行但未产出字段（常见于 Coze 侧服务繁忙/限流/节点异常）

---

## 6. 常用入口

- 管理后台：`http://localhost:3000/admin`
- 管理员登录（dev）：`http://localhost:3000/api/dev/super-admin/login`
- WebSocket 状态（dev）：`http://localhost:3000/api/ws/stats`

