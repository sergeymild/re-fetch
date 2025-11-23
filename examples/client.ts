/**
 * Пример использования long polling с re-fetch
 *
 * Запуск:
 * 1. В первом терминале: node examples/server.js
 * 2. Во втором терминале: npx ts-node examples/client.ts
 */

import { createSafeFetch } from '../src/index';

let currentToken = 'valid-token';

// Создаем API клиент с автоматическим обновлением токена
const api = createSafeFetch({
  baseURL: 'http://localhost:3000',
  authentication: () => ({
    Authorization: `Bearer ${currentToken}`
  }),
  refreshToken: async () => {
    console.log('🔄 Refreshing token...');
    const response = await fetch('http://localhost:3000/refresh-token', {
      method: 'POST'
    });
    const data = await response.json();
    currentToken = data.token;
    console.log(`✅ Token refreshed: ${currentToken}`);
  },
  shouldRefreshToken: (res) => res.status === 401
});

interface DataResponse {
  counter: number;
  timestamp: string;
  message: string;
}

async function testBasicRequest() {
  console.log('\n📡 Test 1: Basic request');
  console.log('========================');

  const result = await api.get<DataResponse>('/data');

  if (result.ok) {
    console.log('✅ Success:', result.data);
  } else {
    console.error('❌ Error:', result.error);
  }
}

async function testLongPolling() {
  console.log('\n📡 Test 2: Long polling (10 seconds)');
  console.log('======================================');

  const controller = new AbortController();

  // Останавливаем через 10 секунд
  setTimeout(() => {
    console.log('\n⏹️  Stopping long polling...');
    controller.abort();
  }, 10000);

  const result = await api.get<DataResponse>('/data', {
    longPooling: {
      abort: controller.signal,
      interval: 2000, // каждые 2 секунды
      onUpdated: (data) => {
        if (!data) return
        console.log('🔔 Update received:', {
          counter: data.counter,
          message: data.message,
          time: new Date().toLocaleTimeString()
        });
      }
    }
  });

  if (result.ok) {
    console.log('✅ Initial data:', result.data);
  } else {
    console.error('❌ Error:', result.error);
  }

  // Ждем завершения
  await new Promise(resolve => {
    controller.signal.addEventListener('abort', resolve);
  });

  console.log('✅ Long polling stopped');
}

async function testLongPollingWithCache() {
  console.log('\n📡 Test 3: Long polling with cache (8 seconds)');
  console.log('================================================');

  const controller = new AbortController();

  setTimeout(() => {
    console.log('\n⏹️  Stopping...');
    controller.abort();
  }, 8000);

  // Первый запрос - создаст кеш
  const result1 = await api.get<DataResponse>('/data', {
    cached: {
      cacheTime: 5000,
      onValue: (cachedData) => {
        console.log('💾 Cache hit:', cachedData);
      }
    }
  });

  if (!result1.ok) {
    switch (result1.error.name) {
      case 'HttpError':
        result1.error.body
    }
  }

  console.log('✅ First request:', result1.ok ? result1.data : result1.error);

  // Второй запрос с long polling - первый запрос использует кеш
  const result2 = await api.get<DataResponse>('/data', {
    cached: {
      cacheTime: 5000,
      onValue: (cachedData) => {
        console.log('💾 Cache hit for initial request:', cachedData);
      }
    },
    longPooling: {
      abort: controller.signal,
      interval: 1500,
      onUpdated: (data) => {
        if (!data) return
        console.log('🔔 Update (no cache):', {
          counter: data.counter,
          time: new Date().toLocaleTimeString()
        });
      }
    }
  });

  console.log('✅ Second request (with polling):', result2.ok ? result2.data : result2.error);

  await new Promise(resolve => {
    controller.signal.addEventListener('abort', resolve);
  });

  console.log('✅ Stopped');
}

// Запускаем тесты
async function main() {
  try {
    await testBasicRequest();

    await new Promise(resolve => setTimeout(resolve, 1000));

    await testLongPolling();

    await new Promise(resolve => setTimeout(resolve, 1000));

    await testLongPollingWithCache();

    console.log('\n✅ All tests completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
