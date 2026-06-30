import { defineConfig } from "vite";
import JavaScriptObfuscator from "javascript-obfuscator";

function obfuscateBundle() {
  return {
    name: "obfuscate-bundle",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk" || !output.fileName.endsWith(".js")) {
          continue;
        }

        output.code = JavaScriptObfuscator.obfuscate(output.code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          identifierNamesGenerator: "hexadecimal",
          rotateStringArray: true,
          shuffleStringArray: true,
          splitStrings: true,
          splitStringsChunkLength: 8,
          stringArray: true,
          stringArrayEncoding: ["base64"],
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          unicodeEscapeSequence: false,
        }).getObfuscatedCode();
      }
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [obfuscateBundle()],
  build: {
    outDir: "itch-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
    },
  },
});
