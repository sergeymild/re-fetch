import 'whatwg-fetch';

// Ensure Response is available globally
if (typeof Response === 'undefined') {
  global.Response = (globalThis as any).Response;
}