import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/browser/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          channel: 'msedge',
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
