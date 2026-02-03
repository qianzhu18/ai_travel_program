# AI 旅拍项目（零基础可启动）

本仓库包含三部分：**后端服务 + 管理后台（同一套应用）**、**微信小程序前端**。  
下面的步骤保证“零基础”也能启动并跑起来。

---

## 目录结构

```
ai_travel_program/
  ai-travel-photo-app/   # 后端服务 + 管理后台
  wx-miniapp/            # 微信小程序前端
```

---

## 必备环境（本地启动）

- Node.js 18+（推荐 20）
- pnpm 10+
- MySQL 8+
- 微信开发者工具（用于小程序）

如果没有 pnpm，先执行：
```
corepack enable
corepack prepare pnpm@10.4.1 --activate
```

---

## 一键启动（后端 + 管理后台）

适合本地快速跑起来：

**macOS / Linux：**
```
bash start.sh
```

**Windows：**
```
start.bat
```

启动后访问：
- 管理后台：`http://localhost:3000/admin`
- API 地址：`http://localhost:3000`

---

## 手动启动（更清晰、可排错）

### 1）克隆项目
```
git clone https://github.com/qianzhu18/ai_travel_program.git
cd ai_travel_program
```

### 2）进入后端目录并安装依赖
```
cd ai-travel-photo-app
pnpm install
```

### 3）配置环境变量
复制一份模板：
```
cp .env.example .env
```

编辑 `.env`，至少设置以下字段：
```
PORT=3000
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/ai_travel
JWT_SECRET=change-me
TENCENT_MAP_API_KEY=change-me
STORAGE_TYPE=local
DEV_ADMIN_BYPASS=false
```

> 如果你的数据库密码里有 `!`，请使用单引号：  
> `DATABASE_URL='mysql://root:pass!word@localhost:3306/ai_travel'`

### 4）准备数据库
确保 MySQL 已启动，然后创建数据库：
```
CREATE DATABASE ai_travel DEFAULT CHARSET utf8mb4;
```

### 5）执行数据库迁移
```
pnpm run db:push
```

### 6）启动服务
```
pnpm run dev
```

---

## 微信小程序启动

1）微信开发者工具 → 导入项目 → 选择 `wx-miniapp` 目录  
2）开发者工具设置：  
`详情 → 本地设置 → 勾选“不校验合法域名、web-view、TLS 版本”`  
3）确认 `wx-miniapp/app.js` 里是：
```
apiBaseUrl: 'http://localhost:3000'
```

---

## Docker 一键启动（后端 + 数据库）

如果你不会装环境，用 Docker 更简单：

```
docker compose up -d
docker compose logs -f app
```

启动后访问：
- 管理后台：`http://localhost:3000/admin`
- API 地址：`http://localhost:3000`

> 小程序仍需用微信开发者工具打开 `wx-miniapp`。  

---

## 常见问题（超简版）

- **数据库连接失败（Access denied）**  
  检查 `.env` 里的 `DATABASE_URL` 是否正确、MySQL 是否启动。

- **小程序请求失败 / 404**  
  确认后端在 `http://localhost:3000` 正常运行。

- **不能生成图片**  
  本地存储 `STORAGE_TYPE=local` 无法被 Coze 访问，真实生成需 `cloud` + COS 配置。
