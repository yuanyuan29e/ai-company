# AI陪看无输出问题排查指南

## 问题现象
AI陪看功能开启后，无论是弹幕还是语音都没有任何输出。

## 排查步骤

### 1. 检查前端控制台日志
打开浏览器开发者工具（F12），查看 Console 标签页，寻找以下关键日志：

**正常情况应该看到：**
```
[FrameSampler] ✅ 帧截取成功: data:image/jpeg;base64,/9j/4AAQ... (1 帧已缓存)
[AIReactionEngine] 初始化: frames=1, latestFrame=有
[AIReaction] ✅ 引擎启动! 间隔=6s
[AIReaction] 🎬 首次触发
[AIReaction] 🚀 发起请求 | time=5s | frames=2 | persona=empath
```

**异常情况可能看到：**
```
[AIReaction] ⏸ 跳过: 无帧数据 (frames和latestFrame都为空)
[FrameSampler] ❌ videoRef.current 为空，无法截取帧
[AIReaction] ⛔ 停止定时器 (enabled=false isPlaying=false)
```

### 2. 检查视频播放状态
确认以下几点：
- ✅ 视频是否正常播放（不是暂停状态）
- ✅ 视频时长是否正常加载（不是 00:00）
- ✅ 视频文件路径是否正确（`/01-4K.mp4`）

### 3. 检查AI陪看开关状态
- ✅ 点击"剧搭子"按钮后，按钮是否变为橙色高亮状态
- ✅ 右下角是否出现虚拟角色小窗
- ✅ 是否完成了首次引导流程（选择角色、频率、呈现方式）

### 4. 检查后端服务状态
在终端运行：
```bash
curl http://localhost:3001/api/health
```

**正常响应：**
```json
{
  "status": "ok",
  "mode": "production",
  "features": {
    "chat": true,
    "visionReaction": true,
    "tts": true,
    "frameSampleInterval": 3
  }
}
```

### 5. 检查网络请求
在浏览器开发者工具的 Network 标签页，筛选 XHR/Fetch 请求：
- 查找 `/api/reaction/vision` 请求
- 检查请求状态码（应该是 200）
- 查看请求 Payload 中是否包含 `frames` 数组
- 查看响应内容是否有 SSE 数据流

## 常见问题及解决方案

### 问题1：视频帧采样失败
**症状：** 控制台显示 `[AIReaction] ⏸ 跳过: 无帧数据`

**原因：** video 元素未正确传递给 useFrameSampler

**解决方案：**
1. 检查 `PlayerPage.tsx` 中的 `videoElementRef` 是否正确同步
2. 确认视频 `readyState >= 2`（已加载元数据）
3. 等待视频播放 2-3 秒后再检查

### 问题2：AI引擎未启动
**症状：** 控制台没有 `[AIReaction] ✅ 引擎启动!` 日志

**原因：** `enabled` 或 `isPlaying` 状态不正确

**解决方案：**
1. 确认已点击"剧搭子"按钮开启AI陪看
2. 确认视频正在播放（不是暂停状态）
3. 检查 `CompanionContext` 中的 `settings.enabled` 是否为 true

### 问题3：API调用失败
**症状：** Network 标签页显示 `/api/reaction/vision` 请求失败（500/400错误）

**原因：** 后端API配置问题或混元API Key无效

**解决方案：**
1. 检查 `server/.env` 中的 `HUNYUAN_API_KEY` 是否有效
2. 查看后端终端日志，寻找错误信息
3. 尝试重启后端服务：`cd server && npm run dev`

### 问题4：生成内容被过滤
**症状：** 后端有响应，但前端没有显示

**原因：** AI生成的内容触发了异常过滤规则

**解决方案：**
查看控制台是否有以下日志：
```
[AIReaction] ⏭️ SKIP（画面无需反应）
[AIReaction] 🚫 过滤异常内容: ...
[AIReaction] 检测到重复弹幕，跳过: ...
```

如果频繁出现 SKIP，说明 AI 判断当前画面不值得反应，这是正常的。

### 问题5：节流限制
**症状：** 偶尔有输出，但频率很低

**原因：** 触发了节流机制

**解决方案：**
查看控制台日志：
```
[AIReaction] ⏸ 节流: 距上次5s < 6s
```
这是正常的，AI 会根据设置的频率（高/中/低）控制生成间隔。

## 快速修复脚本

如果以上步骤都无法解决，尝试以下操作：

1. **清除浏览器缓存并刷新**
```bash
# Windows: Ctrl + Shift + Delete
# Mac: Cmd + Shift + Delete
```

2. **重启前后端服务**
```bash
# 停止所有服务（Ctrl+C）
cd /d/PCG_School/ai-companion-demo
pnpm dev
```

3. **检查视频文件**
确认 `client/public/01-4K.mp4` 文件存在且可访问

4. **降级测试：使用对话功能**
点击"和TA聊聊"按钮，发送消息测试 AI 是否正常响应。
如果对话功能正常，说明后端 API 工作正常，问题在于视觉 Reaction 链路。

## 调试模式

在 `client/src/hooks/useAIReactionEngine.ts` 第 164 行附近，已有详细日志。
如需更多调试信息，可以临时添加：

```typescript
// 在 triggerReaction 函数开头添加
console.log('[DEBUG] triggerReaction 被调用', {
  enabled: settings.enabled,
  isPlaying: playerState.isPlaying,
  framesCount: frames.length,
  latestFrame: latestFrame ? '有' : '无',
});
```

## 联系支持

如果以上方法都无法解决，请提供以下信息：
1. 浏览器控制台完整日志（Console 标签页）
2. 后端终端完整日志
3. Network 标签页中 `/api/reaction/vision` 请求的详细信息
4. 操作系统和浏览器版本
