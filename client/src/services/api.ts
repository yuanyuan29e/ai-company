// 生产部署时通过 VITE_API_BASE_URL 指向 Railway 后端
// 例如：https://xxx.up.railway.app/api
// 本地开发留空走 vite proxy
const BASE_URL = import.meta.env.VITE_API_BASE_URL 
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

/**
 * 获取剧集节点数据
 */
export async function fetchEpisodeNodes(episodeId: string) {
  const res = await fetch(`${BASE_URL}/nodes/${episodeId}`);
  if (!res.ok) throw new Error('获取节点数据失败');
  return res.json();
}

/**
 * 获取剧情摘要（防剧透用）
 */
export async function fetchPlotSummary(episodeId: string, currentTime: number) {
  const res = await fetch(`${BASE_URL}/nodes/${episodeId}/summary?time=${currentTime}`);
  if (!res.ok) throw new Error('获取剧情摘要失败');
  return res.json();
}

/**
 * 获取片头结束时间（基于字幕检测）
 */
export async function fetchIntroEndTime(episodeId: string): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/nodes/${episodeId}/intro-end`);
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.introEndTime === 'number' ? data.introEndTime : 0;
  } catch {
    return 0;
  }
}

/**
 * 获取服务器健康状态和功能配置
 */
export async function fetchHealthStatus() {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error('服务器连接失败');
  return res.json();
}

/**
 * 通用 SSE 流式响应解析器
 */
async function parseSSEStream(
  res: Response,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
) {
  const reader = res.body?.getReader();
  if (!reader) {
    onError('无法读取响应流');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) {
            onDone();
            return;
          }
          if (data.error) {
            onError(data.error);
            return;
          }
          if (data.content) {
            onChunk(data.content);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  onDone();
}

/**
 * SSE 流式对话请求
 * @param params 对话参数
 * @param onChunk 每收到一个chunk的回调
 * @param onDone 完成回调
 * @param onError 错误回调
 */
export async function streamChat(
  params: {
    message: string;
    persona: string;
    episodeId: string;
    currentTime: number;
    history: Array<{ role: string; content: string }>;
    currentFrame?: string; // 可选：当前视频帧 Base64，启用视觉增强对话
  },
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
) {
  try {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      onError('请求失败');
      return;
    }

    await parseSSEStream(res, onChunk, onDone, onError);
  } catch (err) {
    onError('网络请求失败，请检查后端服务是否启动');
  }
}

/**
 * SSE 流式视觉 Reaction 请求
 * 借鉴 LiveCC 核心链路：视频帧 → 多模态理解 → 实时 Reaction
 *
 * @param params Reaction 参数
 * @param onChunk 每收到一个token的回调
 * @param onDone 完成回调
 * @param onError 错误回调
 */
export async function streamVisionReaction(
  params: {
    frames: string[];           // Base64 视频帧数组
    persona: string;            // 人格类型
    episodeId: string;          // 剧集ID
    currentTime: number;        // 当前播放时间
    previousReactions?: string[]; // 之前的 Reaction 文本
  },
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
) {
  try {
    const res = await fetch(`${BASE_URL}/reaction/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      onError('视觉 Reaction 请求失败');
      return;
    }

    await parseSSEStream(res, onChunk, onDone, onError);
  } catch (err) {
    onError('视觉 Reaction 网络请求失败');
  }
}

/**
 * 帧场景分析请求（非流式）
 */
export async function analyzeFrame(params: {
  frames: string[];
  episodeId: string;
  currentTime: number;
}): Promise<{ description: string; currentTime: number; frameCount: number }> {
  const res = await fetch(`${BASE_URL}/reaction/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) throw new Error('场景分析请求失败');
  return res.json();
}

/**
 * TTS 语音合成请求（支持情感自适应）
 * @param text 要合成的文本
 * @param voiceType 音色ID
 * @param emotionCategory 情感类型（仅601008/601009/601010支持）
 * @param speed 语速（-2到6）
 */
export async function requestTTS(
  text: string,
  voiceType: number = 602003,
  emotionCategory?: string,
  speed?: number
) {
  const body: Record<string, any> = { text, voiceType };
  if (emotionCategory) body.emotionCategory = emotionCategory;
  if (speed !== undefined) body.speed = speed;

  const res = await fetch(`${BASE_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('TTS请求失败');

  const contentType = res.headers.get('Content-Type');
  if (contentType?.includes('audio')) {
    return { type: 'audio' as const, data: await res.blob() };
  } else {
    return { type: 'fallback' as const, data: await res.json() };
  }
}
