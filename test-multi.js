// 多场景测试：验证不同时间点的反应
const http = require('http');

function testReaction(currentTime, label) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      frames: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k='],
      persona: 'gentle', episodeId: 'jiaoou-ep-01', currentTime: currentTime, previousReactions: []
    });
    const start = Date.now();
    const req = http.request({ hostname: '127.0.0.1', port: 3001, path: '/api/reaction/vision', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c.toString());
      res.on('end', () => {
        const elapsed = Date.now() - start;
        const lines = d.split('\n').filter(l => l.startsWith('data:'));
        const content = lines.map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
          .filter(Boolean).filter(l => l.content).map(l => l.content).join('');
        resolve({ label, currentTime, elapsed, content: content || '[empty]' });
      });
    });
    req.on('error', (e) => resolve({ label, currentTime, elapsed: 0, content: `ERROR: ${e.message}` }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ label, currentTime, elapsed: 30000, content: 'TIMEOUT' }); });
    req.write(body); req.end();
  });
}

async function main() {
  console.log('=== 多场景测试 ===\n');
  
  // 串行测试避免并发问题
  const tests = [
    { time: 15, label: 'scene-01(开头片头,应SKIP)' },
    { time: 60, label: 'scene-02(楮英说死绝了)' },
    { time: 60, label: 'scene-02(再次测试稳定性)' },
    { time: 100, label: 'scene-03(陆千乔出场)' },
  ];
  
  for (const t of tests) {
    const result = await testReaction(t.time, t.label);
    const status = result.content.includes('[SKIP]') ? '⏭️ SKIP' : `💬 ${result.content}`;
    console.log(`[${result.label}] ${result.elapsed}ms → ${status}`);
  }
  
  console.log('\n=== 测试完成 ===');
}

main();
