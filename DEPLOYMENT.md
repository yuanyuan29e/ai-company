# 部署指南

本指南把这个 demo 部署到 **Vercel（前端）+ Railway（后端）+ Cloudflare R2（视频）** 的免费组合。

## 总览

```
[评委浏览器]
   ↓
[Vercel] React/Vite 静态站   ←  访问入口
   ↓ /api/* 跨域 fetch
[Railway] Node/Express 后端  ←  调用混元/TTS
   ↓
[Cloudflare R2] 视频文件     ←  视频源
```

## 0. 准备

- GitHub 账号（仓库已建：`https://github.com/yuanyuan29e/ai-company.git`）
- Vercel 账号（GitHub 登录）
- Railway 账号（GitHub 登录）
- Cloudflare R2 已有 bucket（视频已上传）
- 腾讯混元 API Key、腾讯云 TTS 三件套

## 1. 配置 R2 视频可公开访问 + CORS

**Public Access**

- R2 控制台 → bucket `ai-companion-demo` → **Settings** → **Public access (R2.dev subdomain)** → **Allow Access**
- 开启后会有形如 `https://pub-XXXXXXXX.r2.dev` 的子域，视频完整 URL = `<子域>/01-4K.mp4`

**CORS**

同一页 → **CORS Policy** → 粘贴：

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

部署稳定后建议把 `"*"` 收紧为你的 Vercel 域名。

## 2. 部署后端到 Railway

1. Railway 控制台 → **New Project** → **Deploy from GitHub repo** → 选 `ai-company`
2. 项目创建后进 **Settings** → **Service**：
   - **Root Directory**: `ai-companion-demo`（关键）
   - **Build/Start command**：留空（使用仓库里的 `nixpacks.toml`）
3. 进 **Variables**，逐项添加（值从 `ai-companion-demo/server/.env.example` 对照填入真实值）：

   | Key | 值 |
   |---|---|
   | `HUNYUAN_API_KEY` | 你的混元 key（`sk-xxx`） |
   | `HUNYUAN_SECRET_ID` | 混元 secret id |
   | `HUNYUAN_SECRET_KEY` | 混元 secret key |
   | `HUNYUAN_CHAT_MODEL` | `hunyuan-turbos-latest` |
   | `HUNYUAN_VISION_MODEL` | `hunyuan-vision` |
   | `TTS_SECRET_ID` | TTS secret id |
   | `TTS_SECRET_KEY` | TTS secret key |
   | `TTS_APP_ID` | TTS app id |
   | `FRAME_SAMPLE_INTERVAL` | `3` |
   | `ALLOWED_ORIGINS` | 暂时填 `*`，等 Vercel 部署完成后改成 Vercel 域名 |

4. 进 **Settings** → **Networking** → **Generate Domain**，会得到形如 `https://your-server.up.railway.app` 的公网地址
5. 在浏览器打开 `https://你的railway域名/api/health`，看到 JSON 即成功

## 3. 部署前端到 Vercel

1. Vercel 控制台 → **Add New** → **Project** → 选 `yuanyuan29e/ai-company`
2. **Configure Project**：
   - **Root Directory**: `ai-companion-demo/client`（关键，点 Edit 改）
   - 其它字段保持默认（Framework 会被识别为 Vite）
3. 展开 **Environment Variables** 添加：

   | Key | 值 |
   |---|---|
   | `VITE_API_BASE_URL` | 上一步 Railway 的域名，**不带末尾斜杠**，例：`https://your-server.up.railway.app` |
   | `VITE_VIDEO_URL` | R2 视频完整 URL，例：`https://pub-0f842491c88246568639435503b30783.r2.dev/01-4K.mp4` |

4. **Deploy**
5. 部署完成后会拿到 `https://ai-company-xxxx.vercel.app`

## 4. 回填 CORS

回 Railway → Variables → 把 `ALLOWED_ORIGINS` 改成你的 Vercel 域名（**不带末尾斜杠**），例：

```
ALLOWED_ORIGINS=https://ai-company-xxxx.vercel.app
```

保存后 Railway 会自动重启。

## 5. 验证

打开 Vercel 域名，依次确认：

- [ ] 视频能正常播放（R2 的 1.3GB 首次加载需要等几秒）
- [ ] 自动跳过片头到 104.6s
- [ ] 点右下角"剧搭子"开启 AI 陪看，能看到弹幕/听到 TTS
- [ ] 浏览器 F12 看 Console，无 CORS 错误

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 视频不播放 | R2 没开 Public Access 或 CORS 没配 | 回到第 1 步检查 |
| AI 陪看没反应 | Railway 后端没启 / API Key 不对 | 看 Railway 日志、curl `/api/health` |
| Console 报 CORS error | `ALLOWED_ORIGINS` 与 Vercel 域名不一致 | 复制 Vercel 域名重填，不要带 `/` |
| AI 陪看抓帧报 "tainted canvas" | R2 CORS 没正确返回 `Access-Control-Allow-Origin` | 检查 R2 CORS 规则 |
| Railway 启动失败 | 找不到 `reaction-db/database/reaction.db` | Root Directory 必须是 `ai-companion-demo`，不是 `ai-companion-demo/server` |

## 安全提醒

- **API Key 严禁入库**。`.env` 已在 `.gitignore` 中。
- 部署完成后建议**轮换**所有 key（在腾讯云控制台重新生成、删旧的）。
- 混元 / TTS 都按量计费，公开 demo 有刷量风险。建议：
  - 在 Railway 把 `ALLOWED_ORIGINS` 锁定到 Vercel 域名（已包含此步骤）
  - 在腾讯云控制台设置每日预算上限
  - 评比结束后立即关停 Railway 服务
