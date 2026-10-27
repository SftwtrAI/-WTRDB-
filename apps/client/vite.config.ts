import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import JavaScriptObfuscator from "javascript-obfuscator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function obfuscate(): Plugin {
  return {
    name: "vite:obfuscator",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      // Only obfuscate the main entry chunk; skip code-split chunks
      // which rely on cross-chunk imports that obfuscation can break
      if (!chunk.fileName.endsWith(".js") || !chunk.isEntry) return null;
      const result = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        identifierNamesGenerator: "hexadecimal",
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.5,
        reservedStrings: ["assets/.*", ".*\\.js$", ".*\\.css$"],
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        selfDefending: false,
        transformObjectKeys: false,
        renameGlobals: false,
      });
      return {
        code: result.getObfuscatedCode(),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), obfuscate()],
  optimizeDeps: {
    include: [
      "three",
      "three/examples/jsm/controls/OrbitControls.js",
      "three/examples/jsm/postprocessing/EffectComposer.js",
      "three/examples/jsm/postprocessing/RenderPass.js",
      "three/examples/jsm/postprocessing/UnrealBloomPass.js",
      "three/examples/jsm/postprocessing/OutputPass.js",
      "three/examples/jsm/postprocessing/ShaderPass.js",
      "three/examples/jsm/shaders/VignetteShader.js",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@wtrops/shared": path.resolve(__dirname, "../../libs/shared/src"),
      "@wtrops/core": path.resolve(__dirname, "../../libs/core/src"),
    },
    dedupe: ["three"],
  },
  root: __dirname,
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: path.resolve(__dirname, "tailwind.config.ts"),
        }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/apps/client"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
      allow: ["../.."],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/docs/brain": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/llms.txt": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/llms-full.txt": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
