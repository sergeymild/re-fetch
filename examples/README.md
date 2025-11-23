# Long Polling Examples

Примеры использования long polling с `re-fetch`.

## Локальный тестовый сервер

### 1. Запуск сервера

```bash
node examples/server.js
```

Сервер запустится на `http://localhost:3000` с тремя эндпоинтами:

- `GET /data` - возвращает данные с инкрементирующимся счетчиком
  - Каждый 5-й запрос вернет 401 (expired token) для тестирования refresh token
- `POST /refresh-token` - обновляет токен авторизации
- `GET /random` - возвращает случайные данные

### 2. Запуск клиента

В новом терминале:

```bash
npx ts-node examples/client.ts
```

Клиент выполнит три теста:
1. **Базовый запрос** - простой GET запрос
2. **Long polling** - запрос с автоматическим обновлением каждые 2 секунды
3. **Long polling с кешем** - демонстрация работы кеша и polling вместе

## Пример вывода

```
📡 Test 1: Basic request
========================
✅ Success: { counter: 1, timestamp: '2025-01-23T...', message: 'Data update #1' }

📡 Test 2: Long polling (10 seconds)
======================================
✅ Initial data: { counter: 2, timestamp: '2025-01-23T...', message: 'Data update #2' }
🔔 Update received: { counter: 3, message: 'Data update #3', time: '10:30:15' }
🔔 Update received: { counter: 4, message: 'Data update #4', time: '10:30:17' }
🔄 Refreshing token... (когда counter % 5 === 0)
✅ Token refreshed: refreshed-token-1234567890
🔔 Update received: { counter: 5, message: 'Data update #5', time: '10:30:19' }
⏹️  Stopping long polling...
✅ Long polling stopped
```

## Использование с публичным API

Если не хотите запускать локальный сервер, можете использовать публичные API:

```typescript
import { createSafeFetch } from '../src/index';

const api = createSafeFetch({
  baseURL: 'https://jsonplaceholder.typicode.com'
});

const controller = new AbortController();

// Останавливаем через 10 секунд
setTimeout(() => controller.abort(), 10000);

const result = await api.get('/posts/1', {
  longPooling: {
    abort: controller.signal,
    interval: 3000, // каждые 3 секунды
    onUpdated: (data) => {
      console.log('Обновление:', data);
    }
  }
});

console.log('Первый результат:', result.data);
```

## Особенности long polling

### 1. Кеш используется только для первого запроса

```typescript
await api.get('/data', {
  cached: {
    cacheTime: 5000,
    onValue: (cached) => {
      // Вызывается только для первого запроса если есть кеш
      console.log('Кешированные данные:', cached);
    }
  },
  longPooling: {
    abort: controller.signal,
    interval: 2000,
    onUpdated: (fresh) => {
      // Каждое обновление - всегда свежие данные с сервера
      console.log('Свежие данные:', fresh);
    }
  }
});
```

### 2. Автоматическое обновление токена

```typescript
const api = createSafeFetch({
  authentication: () => ({
    Authorization: `Bearer ${getCurrentToken()}`
  }),
  refreshToken: async () => {
    // Обновляем токен
    const newToken = await refreshAuthToken();
    setCurrentToken(newToken);
  },
  shouldRefreshToken: (res) => res.status === 401
});

// Long polling автоматически обновит токен при 401
await api.get('/protected', {
  longPooling: {
    abort: controller.signal,
    interval: 2000,
    onUpdated: (data) => console.log(data)
  }
});
```

### 3. Остановка polling

```typescript
const controller = new AbortController();

// Запускаем polling
const promise = api.get('/data', {
  longPooling: {
    abort: controller.signal,
    interval: 2000,
    onUpdated: console.log
  }
});

// Останавливаем когда нужно
controller.abort();
```

## Отладка

Сервер логирует все запросы:

```
[2025-01-23T10:30:15.123Z] Request #1: 200 OK
[2025-01-23T10:30:17.456Z] Request #2: 200 OK
[2025-01-23T10:30:19.789Z] Request #3: 200 OK
[2025-01-23T10:30:22.012Z] Request #4: 200 OK
[2025-01-23T10:30:24.345Z] Request #5: 401 Unauthorized (token expired)
[2025-01-23T10:30:24.567Z] Token refreshed: refreshed-token-1234567890
[2025-01-23T10:30:26.890Z] Request #6: 200 OK
```