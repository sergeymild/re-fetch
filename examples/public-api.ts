/**
 * Пример использования long polling с публичным API
 *
 * Запуск: npx ts-node examples/public-api.ts
 *
 * Использует JSONPlaceholder - бесплатный fake REST API для тестирования
 */

import { createSafeFetch } from '../src/index';

const api = createSafeFetch({
  baseURL: 'https://jsonplaceholder.typicode.com'
});

interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
}

interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

async function example1_BasicLongPolling() {
  console.log('\n📡 Example 1: Basic Long Polling');
  console.log('==================================');
  console.log('Запрашиваем пост каждые 3 секунды в течение 12 секунд\n');

  const controller = new AbortController();

  setTimeout(() => {
    console.log('\n⏹️  Останавливаем polling...');
    controller.abort();
  }, 12000);

  const result = await api.get<Post>('/posts/1', {
    longPooling: {
      abort: controller.signal,
      interval: 3000,
      onUpdated: (post) => {
        console.log(`🔔 [${new Date().toLocaleTimeString()}] Обновление:`, {
          id: post.id,
          title: post.title.substring(0, 50) + '...'
        });
      }
    }
  });

  if (result.ok) {
    console.log('✅ Первый результат:', {
      id: result.data.id,
      title: result.data.title
    });
  }

  await new Promise(resolve => {
    controller.signal.addEventListener('abort', resolve);
  });

  console.log('✅ Polling остановлен');
}

async function example2_MultipleEndpoints() {
  console.log('\n📡 Example 2: Polling нескольких эндпоинтов');
  console.log('=============================================');
  console.log('Запрашиваем разные эндпоинты с разными интервалами\n');

  const controller = new AbortController();

  setTimeout(() => {
    console.log('\n⏹️  Останавливаем все polling...');
    controller.abort();
  }, 10000);

  // Polling posts каждые 2 секунды
  const postsPromise = api.get<Post>('/posts/2', {
    longPooling: {
      abort: controller.signal,
      interval: 2000,
      onUpdated: (post) => {
        console.log(`📝 [${new Date().toLocaleTimeString()}] Post update: ${post.title.substring(0, 30)}...`);
      }
    }
  });

  // Polling todos каждые 3 секунды
  const todosPromise = api.get<Todo>('/todos/1', {
    longPooling: {
      abort: controller.signal,
      interval: 3000,
      onUpdated: (todo) => {
        console.log(`✅ [${new Date().toLocaleTimeString()}] Todo update: ${todo.title}`);
      }
    }
  });

  const [postsResult, todosResult] = await Promise.all([postsPromise, todosPromise]);

  console.log('\n📊 Начальные данные:');
  if (postsResult.ok) {
    console.log('  Post:', postsResult.data.title.substring(0, 40) + '...');
  }
  if (todosResult.ok) {
    console.log('  Todo:', todosResult.data.title);
  }

  await new Promise(resolve => {
    controller.signal.addEventListener('abort', resolve);
  });

  console.log('✅ Все polling остановлены');
}

async function example3_WithRetries() {
  console.log('\n📡 Example 3: Long Polling с retry при ошибках');
  console.log('================================================');
  console.log('Polling с автоматическими повторами при ошибках сети\n');

  const controller = new AbortController();

  setTimeout(() => {
    console.log('\n⏹️  Останавливаем polling...');
    controller.abort();
  }, 8000);

  const result = await api.get<Post>('/posts/3', {
    retries: {
      times: 3,
      baseDelayMs: 500
    },
    longPooling: {
      abort: controller.signal,
      interval: 2000,
      onUpdated: (post) => {
        console.log(`🔔 [${new Date().toLocaleTimeString()}] Успешное обновление:`, {
          id: post.id,
          userId: post.userId
        });
      }
    }
  });

  if (result.ok) {
    console.log('✅ Первый результат получен');
  }

  await new Promise(resolve => {
    controller.signal.addEventListener('abort', resolve);
  });

  console.log('✅ Polling остановлен');
}

async function example4_DynamicInterval() {
  console.log('\n📡 Example 4: Изменение интервала polling');
  console.log('==========================================');
  console.log('Демонстрация как изменить интервал polling во время работы\n');

  let controller = new AbortController();
  let currentInterval = 3000;

  console.log(`⏱️  Начальный интервал: ${currentInterval}ms`);

  // Запускаем первый polling
  let pollingPromise = api.get<Post>('/posts/4', {
    longPooling: {
      abort: controller.signal,
      interval: currentInterval,
      onUpdated: (post) => {
        console.log(`🔔 [${new Date().toLocaleTimeString()}] Update с интервалом ${currentInterval}ms`);
      }
    }
  });

  const result = await pollingPromise;
  if (result.ok) {
    console.log('✅ Первый результат получен');
  }

  // Через 5 секунд изменяем интервал
  setTimeout(async () => {
    console.log('\n🔄 Изменяем интервал на 1000ms...');
    controller.abort(); // Останавливаем старый polling

    controller = new AbortController();
    currentInterval = 1000;

    // Запускаем новый polling с новым интервалом
    api.get<Post>('/posts/4', {
      longPooling: {
        abort: controller.signal,
        interval: currentInterval,
        onUpdated: (post) => {
          console.log(`🔔 [${new Date().toLocaleTimeString()}] Update с интервалом ${currentInterval}ms`);
        }
      }
    });
  }, 5000);

  // Останавливаем через 10 секунд
  setTimeout(() => {
    console.log('\n⏹️  Останавливаем polling...');
    controller.abort();
  }, 10000);

  await new Promise(resolve => setTimeout(resolve, 11000));
  console.log('✅ Пример завершен');
}

// Запускаем примеры
async function main() {
  console.log('\n🚀 Long Polling Examples с JSONPlaceholder API\n');

  try {
    await example1_BasicLongPolling();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await example2_MultipleEndpoints();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await example3_WithRetries();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await example4_DynamicInterval();

    console.log('\n✅ Все примеры выполнены!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Ошибка:', error);
    process.exit(1);
  }
}

main();