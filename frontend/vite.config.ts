import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The FastAPI backend (see ../backend). Proxying keeps the app same-origin, so
// no CORS setup is needed in development or `vite preview`.
const proxy = { '/api': 'http://127.0.0.1:8000' };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: { environment: 'node' },
});
