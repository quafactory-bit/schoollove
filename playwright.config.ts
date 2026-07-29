import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3210', trace: 'retain-on-failure' },
  projects: [
    { name:'chromium', use: { ...devices['Desktop Chrome'], channel:'chrome' } },
    { name:'mobile-360', use: { ...devices['Desktop Chrome'], channel:'chrome', viewport:{ width:360,height:800 }, isMobile:true } },
    { name:'mobile-390', use: { ...devices['Desktop Chrome'], channel:'chrome', viewport:{ width:390,height:844 }, isMobile:true } },
    { name:'mobile-412', use: { ...devices['Desktop Chrome'], channel:'chrome', viewport:{ width:412,height:915 }, isMobile:true } },
  ],
})
