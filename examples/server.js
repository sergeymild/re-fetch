/**
 * Простой тестовый сервер для демонстрации long polling
 *
 * Запуск: node examples/server.js
 * Сервер будет доступен на http://localhost:3000
 */

const http = require('http');

let counter = 0;
let authToken = 'valid-token';
let taskStatus = 'pending';
let taskAttempts = 0;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // GET /data - возвращает данные с инкрементирующимся счетчиком
  if (url.pathname === '/data' && req.method === 'GET') {
    counter++;

    const auth = req.headers.authorization;

    // Проверка токена - каждый 5-й запрос "протухает"
    if (counter % 5 === 0 && auth === 'Bearer valid-token') {
      console.log(`[${new Date().toISOString()}] Request #${counter}: 401 Unauthorized (token expired)`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token expired' }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Request #${counter}: 200 OK`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      counter,
      timestamp: new Date().toISOString(),
      message: `Data update #${counter}`
    }));
    return;
  }

  // POST /refresh-token - обновление токена
  if (url.pathname === '/refresh-token' && req.method === 'POST') {
    authToken = `refreshed-token-${Date.now()}`;
    console.log(`[${new Date().toISOString()}] Token refreshed: ${authToken}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: authToken,
      expiresIn: 3600
    }));
    return;
  }

  // GET /random - случайные данные (для тестирования без счетчика)
  if (url.pathname === '/random' && req.method === 'GET') {
    const randomId = Math.floor(Math.random() * 1000);
    console.log(`[${new Date().toISOString()}] Random data: ${randomId}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: randomId,
      value: Math.random(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // GET /task - имитация долгой задачи (для тестирования retry on success)
  // Возвращает 'pending' первые 3 запроса, потом 'ready'
  if (url.pathname === '/task' && req.method === 'GET') {
    taskAttempts++;

    if (taskAttempts < 4) {
      console.log(`[${new Date().toISOString()}] Task attempt #${taskAttempts}: pending`);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'pending',
        attempt: taskAttempts,
        message: 'Task is still processing...'
      }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Task attempt #${taskAttempts}: ready`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ready',
      attempt: taskAttempts,
      data: { result: 'Task completed successfully!' }
    }));
    return;
  }

  // POST /task/reset - сброс состояния задачи
  if (url.pathname === '/task/reset' && req.method === 'POST') {
    taskAttempts = 0;
    console.log(`[${new Date().toISOString()}] Task reset`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Task reset' }));
    return;
  }

  // GET /network-check - всегда возвращает 200 (для проверки доступности сети)
  if (url.pathname === '/network-check' && req.method === 'GET') {
    console.log(`[${new Date().toISOString()}] Network check: OK`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'online' }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Test server running on http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  GET  /data          - Returns incrementing counter data');
  console.log('  POST /refresh-token - Refreshes auth token');
  console.log('  GET  /random        - Returns random data');
  console.log('  GET  /task          - Simulates long-running task (retry on success demo)');
  console.log('  POST /task/reset    - Resets task state');
  console.log('  GET  /network-check - Simple network availability check');
  console.log('\n💡 Every 5th request to /data will return 401 (token expired)');
  console.log('💡 /task returns "pending" 3 times, then "ready"\n');
});
