/**
 * Примеры использования типизированных ошибок
 *
 * Запуск: npx ts-node examples/typed-errors.ts
 */

import { createSafeFetch, toTypedHttpError, isHttpError, asHttpError } from '../src/index';

// Определяем типы ошибок API
interface ValidationError {
  errors: {
    [field: string]: string[];
  };
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

const api = createSafeFetch({
  baseURL: 'https://jsonplaceholder.typicode.com'
});

// Пример 1: Безопасная типизация с toTypedHttpError
async function example1_SafeTyping() {
  console.log('\n📝 Example 1: Safe typing with toTypedHttpError\n');

  const result = await api.post('/posts', {
    title: '', // Empty title - validation error
    body: 'test'
  });

  if (!result.ok) {
    const error = result.error!;
    // Безопасная типизация - возвращает null если не HttpError
    const typed = toTypedHttpError<ValidationError>(error);

    if (typed) {
      console.log('Status:', typed.status);
      console.log('Message:', typed.message);

      // Теперь body типизирован!
      if (typed.body?.errors) {
        console.log('Validation errors:');
        Object.entries(typed.body.errors).forEach(([field, messages]) => {
          console.log(`  ${field}:`, messages.join(', '));
        });
      }
    } else {
      console.log('Not an HTTP error:', error.name);
    }
  }
}

// Пример 2: Уверенная типизация с asHttpError (throws if not HttpError)
async function example2_AssertiveTyping() {
  console.log('\n📝 Example 2: Assertive typing with asHttpError\n');

  const result = await api.get('/posts/999999'); // Non-existent post

  if (!result.ok) {
    const error = result.error!;
    if (isHttpError(error)) {
      try {
        // Бросит исключение если это не HttpError
        const typed = asHttpError<ApiError>(error);

        console.log('HTTP Error detected:');
        console.log('  Status:', typed.status);
        console.log('  Message:', typed.message);

        if (typed.body?.error) {
          console.log('  Error code:', typed.body.error.code);
          console.log('  Error message:', typed.body.error.message);
        }
      } catch (e) {
        console.error('Failed to cast to HttpError:', e);
      }
    }
  }
}

// Пример 3: Type narrowing с guards
async function example3_TypeNarrowing() {
  console.log('\n📝 Example 3: Type narrowing with guards\n');

  const result = await api.get('/posts/1');

  if (!result.ok) {
    const error = result.error!;
    if (isHttpError(error)) {
      console.log('HTTP Error:');
      console.log('  Status:', error.status);
      console.log('  Status Text:', error.statusText);

      // Типизируем body для конкретного статуса
      if (error.status === 404) {
        interface NotFoundError {
          resource: string;
          id: string | number;
        }

        const typed = toTypedHttpError<NotFoundError>(error);
        if (typed?.body) {
          console.log('  Resource:', typed.body.resource);
          console.log('  ID:', typed.body.id);
        }
      }
    } else {
      console.log('Network or timeout error:', error.message);
    }
  } else {
    console.log('Success! Post title:', (result.data as any).title);
  }
}

// Пример 4: Обработка разных типов ошибок
async function example4_MultipleErrorTypes() {
  console.log('\n📝 Example 4: Handling multiple error types\n');

  interface FormErrors {
    username?: string[];
    email?: string[];
    password?: string[];
  }

  const result = await api.post('/users', {
    username: 'u',
    email: 'invalid-email',
    password: '123'
  });

  if (!result.ok) {
    const error = result.error!;

    // Проверяем тип ошибки
    if (isHttpError(error)) {
      const typed = toTypedHttpError<FormErrors>(error);

      if (typed) {
        console.log(`HTTP ${typed.status}: ${typed.statusText}`);

        if (typed.status === 422 && typed.body) {
          console.log('\nValidation errors:');

          if (typed.body.username) {
            console.log('  Username:', typed.body.username.join(', '));
          }
          if (typed.body.email) {
            console.log('  Email:', typed.body.email.join(', '));
          }
          if (typed.body.password) {
            console.log('  Password:', typed.body.password.join(', '));
          }
        }
      }
    } else {
      console.log('Non-HTTP error:', error.name, '-', error.message);
    }
  }
}

// Пример 5: Использование в try-catch
async function example5_WithTryCatch() {
  console.log('\n📝 Example 5: Using with try-catch pattern\n');

  interface ApiErrorBody {
    code: string;
    message: string;
    timestamp: string;
  }

  try {
    const result = await api.get('/posts/1', {
      timeoutMs: 1 // Очень короткий timeout для демонстрации
    });

    if (!result.ok) {
      const error = result.error!;
      // Пытаемся типизировать как HTTP ошибку
      const httpError = toTypedHttpError<ApiErrorBody>(error);

      if (httpError) {
        throw new Error(`API Error ${httpError.status}: ${httpError.body?.message || httpError.message}`);
      }

      // Если не HTTP ошибка, пробрасываем как есть
      throw new Error(`${error.name}: ${error.message}`);
    }

    console.log('Success:', result.data);
  } catch (error) {
    console.error('Caught error:', (error as Error).message);
  }
}

// Пример 6: Создание helper функций
function handleValidationError(error: any): Record<string, string[]> | null {
  interface ValidationErrorBody {
    errors: Record<string, string[]>;
  }

  const typed = toTypedHttpError<ValidationErrorBody>(error);

  if (typed && typed.status === 422 && typed.body?.errors) {
    return typed.body.errors;
  }

  return null;
}

async function example6_HelperFunctions() {
  console.log('\n📝 Example 6: Using helper functions\n');

  const result = await api.post('/users', {
    email: 'invalid'
  });

  if (!result.ok) {
    const error = result.error!;
    const validationErrors = handleValidationError(error);

    if (validationErrors) {
      console.log('Form validation failed:');
      Object.entries(validationErrors).forEach(([field, messages]) => {
        console.log(`  ${field}:`, messages);
      });
    } else {
      console.log('Other error:', error.message);
    }
  }
}

// Запускаем примеры
async function main() {
  console.log('🚀 Typed Error Examples\n');
  console.log('These examples demonstrate how to use type-safe error handling with re-fetch\n');

  try {
    await example1_SafeTyping();
    await example2_AssertiveTyping();
    await example3_TypeNarrowing();
    await example4_MultipleErrorTypes();
    await example5_WithTryCatch();
    await example6_HelperFunctions();

    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

main();