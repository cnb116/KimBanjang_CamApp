// ——— vite.config.js ———
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 모바일 테스트용 LAN 접속 허용
  },
});
