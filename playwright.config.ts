import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173'
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true }
    },
    {
      // Safari/iOS — значимая доля аудитории Яндекс Игр, а движок один на все
      // устройства Apple. Десктопный WebKit ловит несовместимости дешевле,
      // чем жалобы игроков. Скоуп — базовый смоук (загрузка/уровень/меню):
      // полный набор остаётся на Chromium, где живут mock-реклама и пульт.
      name: 'webkit',
      use: { viewport: { width: 1280, height: 720 }, browserName: 'webkit' },
      testMatch: /e2e\/(smoke|webkit)\.spec\.ts/
    }
  ]
});
