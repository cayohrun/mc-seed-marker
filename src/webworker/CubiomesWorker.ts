/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope;
export { };

// Import cubiomes WASM module (ES module format)
import CubiomesModule from '../wasm/cubiomes.mjs';

// MC Version mapping (from cubiomes biomes.h)
const MC_VERSIONS: { [key: string]: number } = {
	'1.0': 1,    // MC_1_0
	'1.1': 2,    // MC_1_1
	'1.2': 3,    // MC_1_2
	'1.3': 4,    // MC_1_3
	'1.4': 5,    // MC_1_4
	'1.5': 6,    // MC_1_5
	'1.6': 7,    // MC_1_6
	'1.7': 8,    // MC_1_7
	'1.8': 9,    // MC_1_8
	'1.9': 10,   // MC_1_9
	'1.10': 11,  // MC_1_10
	'1.11': 12,  // MC_1_11
	'1.12': 13,  // MC_1_12
	'1.13': 14,  // MC_1_13
	'1.14': 15,  // MC_1_14
	'1.15': 16,  // MC_1_15
	'1.16': 17,  // MC_1_16
	'1.17': 18,  // MC_1_17
	'1.18': 19,  // MC_1_18
	'1.19': 20,  // MC_1_19
	'1.20': 21,  // MC_1_20
	'1.21': 22,  // MC_1_21
};

// ShaderKind enum (matches mcseedmap.net)
const ShaderKind = {
	None: 0,
	Simple: 1,
	Stepped: 2
};

interface CubiomesModuleInstance {
	_init_buffer: (size: number) => number;
	_get_buffer: () => number;
	_generate_biome_image: (
		seed_lo: number,
		seed_hi: number,
		x: number,
		z: number,
		width: number,
		height: number,
		scale: number,
		mc_version: number,
		shader_kind: number,
		y_level: number
	) => number;
	_get_biome_at: (
		seed_lo: number,
		seed_hi: number,
		x: number,
		y: number,
		z: number,
		scale: number,
		mc_version: number
	) => number;
	_malloc: (size: number) => number;
	_free: (ptr: number) => void;
	HEAPU8: Uint8Array;
	cwrap: (name: string, returnType: string | null, argTypes: string[]) => Function;
}

class CubiomesWorkerClass {
	private module: CubiomesModuleInstance | null = null;
	private taskQueue: any[] = [];
	private isModuleReady = false;

	private state: {
		seed: bigint;
		y: number;
		mcVersion: string;
		shaderKind: number;
		generationVersion: number;
	} = {
		seed: BigInt(0),
		y: 64,
		mcVersion: '1.21',
		shaderKind: ShaderKind.Simple,
		generationVersion: -1
	};

	constructor() {
		this.initModule();
	}

	private async initModule() {
		try {
			// Initialize the ES module
			this.module = await CubiomesModule({
				locateFile: (path: string) => {
					if (path.endsWith('.wasm')) {
						// Use absolute path for WASM file
						return new URL('../wasm/cubiomes.wasm', import.meta.url).href;
					}
					return path;
				}
			}) as CubiomesModuleInstance;

			this.isModuleReady = true;
			console.log('[CubiomesWorker] WASM module loaded');
		} catch (error) {
			console.error('[CubiomesWorker] Failed to load WASM module:', error);
		}
	}

	public update(update: {
		seed?: string;  // BigInt serialized as string
		y?: number;
		mcVersion?: string;
		shaderKind?: number;
		generationVersion?: number;
	}) {
		if (update.seed !== undefined) this.state.seed = BigInt(update.seed);
		if (update.y !== undefined) this.state.y = update.y;
		if (update.mcVersion !== undefined) this.state.mcVersion = update.mcVersion;
		if (update.shaderKind !== undefined) this.state.shaderKind = update.shaderKind;
		if (update.generationVersion !== undefined) this.state.generationVersion = update.generationVersion;

		// Clear task queue on update
		this.taskQueue = [];
	}

	public addTask(task: any) {
		this.taskQueue.push(task);
	}

	public removeTask(key: string) {
		const index = this.taskQueue.findIndex((t) => t.key === key);
		if (index >= 0) {
			this.taskQueue.splice(index, 1);
		}
	}

	public async loop() {
		while (true) {
			if (this.taskQueue.length === 0 || !this.isModuleReady) {
				await new Promise(r => setTimeout(r, 100));
			} else {
				const task = this.taskQueue.shift();
				this.generateTile(task);
				await new Promise(r => setTimeout(r, 0));
			}
		}
	}

	private splitInt64(value: bigint): [number, number] {
		// Split int64 into low and high 32-bit parts for Emscripten
		const mask32 = BigInt(0xFFFFFFFF);
		const low = Number(value & mask32);
		const high = Number((value >> BigInt(32)) & mask32);
		return [low, high];
	}

	private generateTile(task: {
		key: string;
		x: number;
		z: number;
		width: number;
		height: number;
		scale: number;
	}) {
		if (!this.module || !this.isModuleReady) {
			console.warn('[CubiomesWorker] Module not ready');
			return;
		}

		const { key, x, z, width, height, scale } = task;

		// Get MC version enum
		const mcVersionEnum = MC_VERSIONS[this.state.mcVersion] || MC_VERSIONS['1.21'];

		// Split seed into low/high parts for int64
		const [seedLo, seedHi] = this.splitInt64(this.state.seed);

		try {
			// Call WASM to generate image
			const imgSize = this.module._generate_biome_image(
				seedLo,
				seedHi,
				Math.floor(x),
				Math.floor(z),
				width,
				height,
				scale,
				mcVersionEnum,
				this.state.shaderKind,
				this.state.y
			);

			if (imgSize <= 0) {
				console.error('[CubiomesWorker] generate_biome_image returned invalid size:', imgSize);
				return;
			}

			// Get buffer pointer and copy data
			const bufferPtr = this.module._get_buffer();
			const imageData = new Uint8ClampedArray(imgSize);
			imageData.set(new Uint8Array(this.module.HEAPU8.buffer, bufferPtr, imgSize));

			// Send result back
			postMessage({
				key,
				imageData,
				width,
				height,
				generationVersion: this.state.generationVersion
			});
		} catch (error: any) {
			console.error('[CubiomesWorker] Error generating tile:', error?.message || error?.toString() || error);
		}
	}
}

const worker = new CubiomesWorkerClass();
worker.loop();

self.onmessage = (evt: MessageEvent) => {
	if ('update' in evt.data) {
		worker.update(evt.data.update);
	} else if ('task' in evt.data) {
		worker.addTask(evt.data.task);
	} else if ('cancel' in evt.data) {
		worker.removeTask(evt.data.cancel);
	}
};
