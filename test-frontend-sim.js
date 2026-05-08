// 模拟前端真实调用场景：检查后端接口是否正常响应
const http = require('http');

// 模拟前端发送的真实帧数据（1x1像素JPEG，与test-quick.js相同）
const fakeFrame = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';

const tests = [
  { time: 10, desc: 'scene-01 (t=10, 片头无台词)' },
  { time: 50, desc: 'scene-02 (t=50, 楮英说死绝了)' },
  { time: 60, desc: 'scene-02 (t=60, 楮英说死绝了)' },
];

async function test(t) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      frames: [fakeFrame, fakeFrame],  // 前端发2帧
      persona: 'empath',  // 默认人格
      episodeId: 'jiaoou-ep-01',
      currentTime: t.time,
      previousReactions: [],
    });

    const start = Date.now();
    const req = http.request({
      hostname: '127.0.0.1', port: 3001,
      path: '/api/reaction/vision',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c.toString());
      res.on('end', () => {
        const elapsed = Date.now() - start;
        // 解析SSE
        const lines = data.split('\n').filter(l => l.startsWith('data:'));
        const content = lines.map(l => {
          try { return JSON.parse(l.slice(5).trim()); } catch { return null; }
        }).filter(Boolean).filter(l => l.content).map(l => l.content).join('');
        
        const isSkip = content.includes('[SKIP]');
        const wouldBeFiltered = !isSkip && content.length > 30;
        
        console.log(`\n[${t.desc}]`);
        console.log(`  耗时: ${elapsed}ms | 状态码: ${res.statusCode}`);
        console.log(`  原始输出: "${content}"`);
        console.log(`  长度: ${content.length}字符`);
        if (isSkip) console.log(`  ⏭️  → 被判为SKIP`);
        else if (wouldBeFiltered) console.log(`  ⚠️  → 长度>${30}，会被前端过滤!`);
        else console.log(`  ✅ → 正常输出（会在前端显示）`);
        
        resolve();
      });
    });
    req.on('error', (e) => { console.log(`[${t.desc}] ERROR:`, e.message); resolve(); });
    req.setTimeout(30000, () => { console.log(`[${t.desc}] TIMEOUT`); req.destroy(); resolve(); });
    req.write(body); req.end();
  });
}

async function main() {
  console.log('=== 前端模拟测试（检查前端过滤逻辑）===');
  console.log('过滤条件: text.length > 30 会被丢弃');
  console.log('');
  
  for (const t of tests) {
    await test(t);
  }
  
  console.log('\n=== 测试完成 ===');
}

main();
