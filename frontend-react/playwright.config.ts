import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',workers:1,timeout:90000,use:{baseURL:process.env.HG_E2E_ORIGIN||'http://127.0.0.1:5173',headless:true,trace:'off'},reporter:'list'});
