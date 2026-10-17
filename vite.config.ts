import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const empty = path.join(root, "src/shims/empty.ts");

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const htmlInputs = {
  main: path.join(root, "index.html"),
  admin: path.join(root, "admin.html"),
  adminWords: path.join(root, "admin-words.html"),
};

export default defineConfig({
  plugins: [cloudflare()],
  resolve: {
    alias: {
      path: empty,
      "fs/promises": empty,
    },
  },
  optimizeDeps: {
    exclude: ["kokoro-js", "@huggingface/transformers", "phonemizer"],
  },
  server: {
    port: 5173,
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  assetsInclude: ["**/*.wasm"],
  worker: {
    format: "es",
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: htmlInputs,
        },
      },
    },
  },
});
