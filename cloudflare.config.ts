import { bindings, defineConfig } from "cf/config";

const accountId = "3315bb3e7d2e3556bfea6fb3947a890e";

export default defineConfig(({ mode }) => {
	const staging = mode === "staging";

	return {
		accountId,
		worker: {
			name: staging ? "letter-game-staging" : "letter-game",
			compatibilityDate: "2026-10-17",
			entrypoint: "./worker/index.ts",
			workersDev: true,
			previewUrls: true,
			assets: {
				runWorkerFirst: [
					"/models/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx",
				],
			},
			domains: staging
				? ["staging.letterblocks.robertlancer.com"]
				: ["letterblocks.robertlancer.com"],
			env: {
				MODELS: bindings.r2({
					name: "letter-game-assets",
				}),
			},
		},
	};
});
