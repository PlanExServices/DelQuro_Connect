import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, [
    "REACT_APP_BACKEND_URL", "BACKEND_PROXY_TARGET", "HOST", "PORT", "DEV_ALLOWED_HOSTS",
  ]);
  const backendUrl = env.REACT_APP_BACKEND_URL || "";

  return {
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    envPrefix: [],
    define: { "import.meta.env.REACT_APP_BACKEND_URL": JSON.stringify(backendUrl) },
    build: { outDir: "build", assetsDir: "static" },
    server: {
      host: env.HOST || "127.0.0.1",
      port: Number(env.PORT || 3000),
      allowedHosts: (env.DEV_ALLOWED_HOSTS || "").split(",").map((host) => host.trim()).filter(Boolean),
      headers: { "Cross-Origin-Resource-Policy": "same-origin" },
      proxy: backendUrl ? undefined : {
        "/api": {
          target: env.BACKEND_PROXY_TARGET || "http://127.0.0.1:8000",
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
