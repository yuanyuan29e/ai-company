# 🎬 AI虚拟陪看Reaction Demo

> 腾讯校园AI产品大赛 - AI虚拟陪看Reaction产品原型

基于腾讯视频播放页风格，实现「AI先看视频 → 再生成陪看内容」的AI虚拟陪看体验。

## ✨ 核心功能

- 🎥 **腾讯视频风格播放页** - 深色主题、橙色进度条、自定义控制栏
- 🤖 **AI陪看按钮入口** - 一键开启AI陪看模式
- 👾 **虚拟角色小窗** - 可拖拽、呼吸动效、表情切换（3类形象 × 5种人格）
- 💬 **被动Reaction弹幕** - AI根据剧情节点自动触发，4种类型颜色标识
- 🗣️ **主动对话聊天** - SSE流式交互，防剧透机制
- ⚙️ **个性化设置面板** - 频率/风格/形式全方位可调
- 🎯 **首次引导流程** - 3步Onboarding引导

## 🚀 快速启动

### 前提条件
- Node.js >= 18
- pnpm >= 8

### 安装 & 运行

```bash
# 1. 进入项目目录
cd ai-companion-demo

# 2. 安装依赖
pnpm install

# 3. 同时启动前后端
pnpm dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:3001

### Demo模式

默认启用Demo模式（`DEMO_MODE=true`），无需配置任何API Key即可运行。
AI对话使用预设的模拟回复，Reaction使用内置的剧情节点数据。

### 接入真实AI（可选）

编辑 `server/.env`，填入腾讯混元API Key：

```env
HUNYUAN_SECRET_ID=your_real_id
HUNYUAN_SECRET_KEY=your_real_key
DEMO_MODE=false
```

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript + Vite |
| UI组件 | TDesign React（暗色主题） |
| 样式 | Tailwind CSS |
| 动效 | Framer Motion + CSS动画 |
| 视频 | HTML5 Video（自定义控制栏） |
| 后端 | Node.js + Express + TypeScript |
| AI | 腾讯混元大模型API |
| 数据 | JSON（预处理剧情节点） |

## 📁 项目结构

```
ai-companion-demo/
├── client/              # 前端
│   ├── src/
│   │   ├── components/  # UI组件
│   │   ├── contexts/    # 全局状态
│   │   ├── hooks/       # 自定义Hook
│   │   ├── services/    # API封装
│   │   ├── data/        # Demo数据
│   │   └── types/       # TypeScript类型
│   └── public/          # 静态资源
├── server/              # 后端
│   └── src/
│       ├── routes/      # API路由
│       ├── services/    # 业务服务
│       ├── prompts/     # 人格Prompt
│       └── data/        # 剧情数据
└── README.md
```

## 📋 演示流程

1. 打开页面，看到腾讯视频风格的播放页
2. 点击控制栏"AI陪看"按钮
3. 首次使用会弹出引导：选择形象 → 选择人格 → 确认
4. 播放视频，AI根据剧情节点自动弹出Reaction气泡
5. 点击"和TA聊聊"打开对话面板，和AI聊当前剧情
6. 右键"AI陪看"按钮或点击角色齿轮打开设置面板
