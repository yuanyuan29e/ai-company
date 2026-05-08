const http = require('http');
const body = JSON.stringify({
  frames: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k='],
  persona: 'gentle', episodeId: 'jiaoou-ep-01', currentTime: 60, previousReactions: []
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
    console.log(`耗时: ${elapsed}ms`);
    console.log(`结果: ${content || '[empty]'}`);
    if (d.includes('error')) console.log('原始数据:', d.slice(0, 500));
  });
});
req.on('error', (e) => console.log('ERROR:', e.message));
req.setTimeout(30000, () => { console.log('TIMEOUT 30s'); req.destroy(); });
req.write(body); req.end();
