/**
 * TTS 语音合成服务
 * 调用腾讯云 TTS API
 *
 * 超自然大模型音色（voiceType）常用值：
 * 502001 - 智小柔（聊天女声，默认）
 * 502003 - 智小敏（聊天女声）
 * 502005 - 智小解（解说男声）
 * 502006 - 智小悟（聊天男声）
 * 502007 - 智小虎（聊天童声）
 * 602003 - 爱小悠（聊天女声）
 * 602004 - 暖心阿灿（聊天男声）
 * 603007 - 邻家女孩（聊天女声）
 */
export async function synthesizeSpeech(
  text: string,
  voiceType: number = 502001,
  emotionCategory?: string,
  speed?: number
): Promise<{ audioData: Buffer | null; error?: string }> {
  const secretId = process.env.TTS_SECRET_ID;
  const secretKey = process.env.TTS_SECRET_KEY;
  const appId = process.env.TTS_APP_ID;

  if (!secretId || !secretKey || !appId ||
      secretId.startsWith('demo') || secretKey.startsWith('demo')) {
    return {
      audioData: null,
      error: 'TTS API Key 未配置，请在 .env 中设置 TTS_SECRET_ID、TTS_SECRET_KEY 和 TTS_APP_ID',
    };
  }

  try {
    // 动态导入腾讯云 TTS SDK（ESM 兼容）
    const ttsModule = await import('tencentcloud-sdk-nodejs-tts');
    const TtsClient = ttsModule.tts.v20190823.Client;

    const client = new TtsClient({
      credential: {
        secretId,
        secretKey,
      },
      region: 'ap-guangzhou',
      profile: {
        httpProfile: {
          endpoint: 'tts.tencentcloudapi.com',
        },
      },
    });

    const params: Record<string, any> = {
      Text: text,
      SessionId: `session-${Date.now()}`,
      VoiceType: voiceType,
      Codec: 'mp3',
      SampleRate: 16000,
      Volume: 5,
      Speed: typeof speed === 'number' ? Math.max(-2, Math.min(6, speed)) : 0,
      ModelType: 0,
    };
    if (emotionCategory) {
      params.EmotionCategory = emotionCategory;
    }

    console.log('[TTS] 合成请求:', { text: text.slice(0, 50), voiceType, emotionCategory, speed: params.Speed });

    const response = await client.TextToVoice(params);

    if (response.Audio) {
      // 返回的 Audio 是 Base64 编码的音频数据
      const audioBuffer = Buffer.from(response.Audio, 'base64');
      console.log('[TTS] 合成成功, 音频大小:', audioBuffer.length, 'bytes');
      return { audioData: audioBuffer };
    } else {
      return {
        audioData: null,
        error: '语音合成返回为空',
      };
    }
  } catch (error: any) {
    console.error('[TTS] 合成失败:', error?.message || error);
    return {
      audioData: null,
      error: `语音合成失败: ${error?.message || '未知错误'}`,
    };
  }
}
