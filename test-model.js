// 直接测试混元 API 模型是否可用
const https = require('https');

const API_KEY = 'sk-5L6fzkLf3xUTLO5h4z0gbOybt9YUmVv8UGN840g4qb2TC6aT';
const MODEL = 'hunyuan-turbos-latest';

const body = JSON.stringify({
  model: MODEL,
  messages: [
    { role: 'user', content: '用一句话打个招呼' }
  ],
  max_tokens: 30,
  temperature: 0.7,
});

console.log(`测试模型: ${MODEL}`);
console.log('发送请求...');
const start = Date.now();

const req = https.request({
  hostname: 'api.hunyuan.cloud.tencent.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk.toString());
  res.on('end', () => {
    const elapsed = Date.now() - start;
    console.log(`状态码: ${res.statusCode} | 耗时: ${elapsed}ms`);
    try {
      const json = JSON.parse(data);
      if (json.choices && json.choices[0]) {
        console.log(`✅ 模型响应: "${json.choices[0].message.content}"`);
        console.log(`Token使用: input=${json.usage?.prompt_tokens}, output=${json.usage?.completion_tokens}`);
      } else if (json.error) {
        console.log(`❌ API错误: ${json.error.message || JSON.stringify(json.error)}`);
      } else {
        console.log('响应:', JSON.stringify(json).slice(0, 500));
      }
    } catch (e) {
      console.log('解析失败，原始响应:', data.slice(0, 500));
    }
  });
});

req.on('error', (e) => console.log('网络错误:', e.message));
req.setTimeout(15000, () => { console.log('超时 15s'); req.destroy(); });
req.write(body);
req.end();
