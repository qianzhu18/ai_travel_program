# 项目上下文与当前进展（本地调试总结）

> 本文用于记录我们在本地调试该项目的过程、已解决问题、当前可运行状态、关键依赖与待办事项。  
> 适合作为后续接手/协作/部署的上下文文档。

---

## 1. 项目结构概览
- `ai-travel-photo-app/`：后端服务 + 管理后台（同一套应用）
- `wx-miniapp/`：微信小程序前端
- `README.md` / `TROUBLESHOOTING.md`：文档与排障说明

---

## 2. 当前本地可运行状态
**已可运行（本地）：**
- 后端服务已启动（`http://localhost:3000`）
- 管理后台可访问（`http://localhost:3000/admin`）
- 小程序可打开并拉取模板列表（需数据库数据）

**仍需配置才能跑通：**
- **AI 生成链路（Coze）**：未配置 `COZE_API_KEY`/`workflow` 时会失败
- **公网图片访问**：`STORAGE_TYPE=local` 时图片仅本机可见，Coze 无法访问

---

## 3. 已解决的关键问题
1. **小程序报错导致无法编译**
   - `wx-miniapp/pages/paid-templates/paid-templates.js` 中出现语法错误，已修复
2. **无效权限声明告警**
   - `wx-miniapp/app.json` 中 `permission.scope.camera` / `scope.writePhotosAlbum` 为无效配置，已移除
3. **模板导入失败（403）**
   - 原因：后台上传接口需 admin 权限，cookie 不生效导致 403
   - 解决：增加 `DEV_ADMIN_BYPASS`（仅开发环境可选）
4. **一键启动 / 环境初始化流程不清晰**
   - 新增 `scripts/init-env.mjs`，支持自动生成 `.env`、创建数据库
   - 更新 `start.sh / start.bat` 支持 corepack 安装 pnpm
5. **模板缓存不刷新**
   - 通过 `template_version` 机制 + 清缓存解决

---

## 4. 本地运行必要配置（总结）
### 4.1 必需配置
```
PORT=3000
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/ai_travel
JWT_SECRET=...
STORAGE_TYPE=local
```

### 4.2 可选配置（仅开发调试）
```
DEV_ADMIN_BYPASS=true
```
> 开发环境强制 admin，用于解决后台上传 403

### 4.3 AI 生成相关（必须）
若要“拍照→生成”成功，必须配置：
```
COZE_API_KEY=...
COZE_BOT_ID=可选（部分 workflow 需要）
COZE_SINGLE_FACE_WORKFLOW_ID=...
COZE_DOUBLE_FACE_WORKFLOW_ID=...
COZE_USER_ANALYZE_WORKFLOW_ID=...
```
并建议使用 COS：
```
STORAGE_TYPE=cloud
COS_SECRET_ID=...
COS_SECRET_KEY=...
COS_BUCKET=...
COS_REGION=...
```

---

## 5. 模板导入标准流程（关键）
后台「模板配置」页面导入模板后，必须完成：
1. 导入文件夹  
2. **等待上传完成**（必须显示 X/X 成功）  
3. 点击“生成模板ID”  
4. 点击“保存模板库”  

> 只有“保存模板库”才会写入 `templates` 表，否则刷新会消失。

若小程序仍是旧图：
```
UPDATE systemConfigs
SET configValue = CAST(configValue AS UNSIGNED) + 1
WHERE configKey='template_version';
```
并在微信开发者工具中清缓存重启。

---

## 6. 当前已知风险/缺口
1. **Coze 配置缺失** → 生成失败  
2. **本地存储不可公网访问** → Coze 无法读取图片  
3. **文档不足** → 新用户难以完成导入/生成闭环  
4. **系统依赖复杂** → 配置缺失时没有清晰错误指引  

---

## 7. 待办事项（建议）
1. 写清「模板导入」与「生成链路」的完整说明（已部分补充）
2. 增加“本地 demo 模式”（不依赖 Coze，直接返回模板图）
3. 补充 macOS / Linux 启动流程与排障步骤
4. 增加“系统配置检查”页面：提示缺少 Coze / COS 配置

---

## 8. 我们这次调试的关键经验
- **403 = 权限问题**：后台上传只对 admin 放行
- **数据入库≠导入文件夹**：必须保存模板库
- **本地图片无法被云端访问**：需要公网存储
- **缓存机制会掩盖真实数据**：版本号 + 清缓存是必要步骤

---

## 9. 当前结论
本地 demo 可运行到“模板导入 + 列表展示”阶段；  
“拍照生成”链路需要补齐 Coze 配置与公网存储，或引入 demo mock 方案。  
后续协作建议以本文件作为上下文入口，统一补齐文档与配置说明，减少重复排障成本。
