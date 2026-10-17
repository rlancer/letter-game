import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "letter-game",
		compatibilityDate: "2026-10-17",
		entrypoint: "./worker/index.ts",
		workersDev: true,
		previewUrls: true,
		assets: {
			runWorkerFirst: [
				"/models/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx",
			],
		},
		env: {
			MODELS: bindings.r2({
				name: "letter-game-assets",
			}),
		},
	},
});
