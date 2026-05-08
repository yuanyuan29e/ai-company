import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat.js';
import { nodesRouter } from './routes/nodes.js';
import { ttsRouter } from './routes/tts.js';
import { reactionRouter } from './routes/reaction.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
// 允许的来源：通过 ALLOWED_ORIGINS 环境变量控制（逗号分隔）
// 本地默认放开 5173/5174；生产部署需在 Railway 把 Vercel 域名加进来
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(cors({
  origin: (origin, cb) => {
    // 同源/curl/无 Origin 头的请求直接放行
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));
// 增大 JSON body 限制，支持 Base64 视频帧传输
app.use(express.json({ limit: '10mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: 'production',
    features: {
      chat: true,
      visionReaction: true,
      tts: true,
      frameSampleInterval: parseInt(process.env.FRAME_SAMPLE_INTERVAL || '3'),
    },
  });
});

// 路由
app.use('/api/nodes', nodesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/reaction', reactionRouter);

// 启动服务
app.listen(PORT, () => {
  console.log(`🚀 AI陪看后端服务已启动: http://localhost:${PORT}`);
  console.log(`📺 模式: 生产模式（调用混元API）`);
  console.log(`🎯 功能: 对话 ✅ | 视觉Reaction ✅ | TTS ✅ | 画面人物鉴别 ✅`);
  console.log(`🖼️ 帧采样间隔: ${process.env.FRAME_SAMPLE_INTERVAL || 3}秒`);
  console.log(`🌐 CORS 允许来源: ${allowedOrigins.join(', ')}`);
});
