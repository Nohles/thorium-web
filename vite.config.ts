import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import svgr from "vite-plugin-svgr";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    svgr({
      include: "**/*.svg",
      exclude: "**/*.svg?url",
    }),
    tanstackStart({
      client: {
        entry: "./src/client.tsx",
      },
    }),
    viteReact(),
  ],
});
