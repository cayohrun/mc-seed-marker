import * as L from "leaflet"
import * as Comlink from "comlink"
import { useSettingsStore } from "../stores/useSettingsStore.js"
import { useLoadedDimensionStore } from "../stores/useLoadedDimensionStore.js"
import { DensityFunction, NoiseSettings } from "deepslate"
import { Ref, watch } from "vue"

// ShaderKind enum matching existing interface
enum ShaderKind {
	None = 0,
	Simple = 1,
	Stepped = 2
}

// ContourKind enum
enum ContourKind {
	None = 0,
	Simple = 1
}

// Dimension mapping
const DIMENSION_MAP: Record<string, number> = {
	'minecraft:overworld': 0,
	'minecraft:the_nether': -1,
	'minecraft:the_end': 1
}

// Parse version string like "1_21_4" to { major, minor, patch }
function parseVersion(versionStr: string): { major: number; minor: number; patch: number } {
	const parts = versionStr.split('_').map(Number)
	return {
		major: parts[0] || 1,
		minor: parts[1] || 21,
		patch: parts[2] || 0
	}
}

const DEFAULT_MAX_BIOME_ID = 255

// Debug flag
const DEBUG = false

// Worker pool size calculation
function getWorkerPoolSize(): number {
	if (typeof navigator === 'undefined') return 4
	return Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1))
}

// CubiomesGenerator interface (compatible with worker)
interface CubiomesGenerator {
	initialize(wasmPath: string): Promise<void>
	configure(
		seed: bigint,
		tileSize: number,
		library: number,
		versionMajor: number,
		versionMinor: number,
		versionPatch: number,
		dimension: number,
		largeBiomes: boolean
	): void
	setColors(colors: number[]): void
	setBiomeTree(data: Uint8Array, url: string): void
	getBiomeTreeUrl(): string | undefined
	generateBiomeImage(
		zoomOffset: number,
		x: number,
		z: number,
		yLevel: number,
		shaderKind: ShaderKind,
		contourKind: ContourKind,
		useFade: boolean,
		useDesaturate: boolean,
		useHighlight: boolean,
		highlightedBiomes: Uint16Array,
		fadedBiomes: Uint16Array,
		fadeColor: number,
		biomeCount: number,
		showSlime: boolean,
		heightmap?: Float32Array,
		heightmapWidth?: number,
		heightmapHeight?: number,
		heightmapScale?: number
	): Promise<ArrayBuffer>
}

// Worker instance
interface WorkerInstance {
	worker: Worker
	generator: Comlink.Remote<CubiomesGenerator>
	busy: boolean
	ready: boolean
	index: number
	currentTask: TileTask | null
}

// Tile task
interface TileTask {
	key: string
	coords: L.Coords
	requestId: number
	resolve: (buffer: ArrayBuffer | null) => void
	done: L.DoneCallback
}

type Tile = {
	coords: L.Coords,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	done: L.DoneCallback,
	pending: boolean,
	requestId: number
}

/**
 * BiomeLayer using Cubiomes WASM for biome generation
 * No btree dependency - pure algorithmic generation
 */
export class CubiomesBiomeLayer extends L.GridLayer {
	private Tiles: { [key: string]: Tile } = {}
	private tileSize = 256
	private settingsStore = useSettingsStore()
	private loadedDimensionStore = useLoadedDimensionStore()

	// Worker pool
	private workers: WorkerInstance[] = []
	private isPoolReady = false
	private initPromise: Promise<void> | null = null
	private initFailed = false
	private workerPoolSize: number

	// Task management
	private taskQueue: TileTask[] = []
	private currentRequestId = 0

	// Update barrier
	private isUpdating = false
	private configUpdateId = 0
	private pendingConfigUpdate = false

	// Disposed flag
	private isDisposed = false

	// Tracking
	private lastTileRenderedAt = 0
	private tileRenderCount = 0

	// RuntimeError handling
	private lastRuntimeResetAt = 0
	private runtimeResetInFlight = false

	constructor(
		options: L.GridLayerOptions,
		private do_hillshade: Ref<boolean>,
		private y: Ref<number>
	) {
		super(options)
		this.tileSize = options.tileSize as number
		this.workerPoolSize = getWorkerPoolSize()

		this.initPromise = this.initWorkerPool()

		// Watch for hillshade toggle
		watch(do_hillshade, () => {
			this.invalidateAndRedraw()
		})

		// Watch for Y level changes
		watch(y, () => {
			this.invalidateAndRedraw()
		})

		// Watch for seed changes
		watch(() => this.settingsStore.seed, () => {
			this.updateConfigThenRedraw().catch(this.logError)
		})

		// Watch for version changes
		watch(() => this.settingsStore.mc_version, () => {
			this.updateConfigThenRedraw().catch(this.logError)
		})

		// Watch for dimension changes
		watch(() => this.settingsStore.dimension, () => {
			this.updateConfigThenRedraw().catch(this.logError)
		})
	}

	private logError = (error: unknown) => {
		console.error('[CubiomesBiomeLayer] Async error:', error)
	}

	private async updateConfigThenRedraw() {
		if (this.isDisposed) return

		const updateId = ++this.configUpdateId
		this.isUpdating = true

		try {
			if (!this.isPoolReady) {
				this.pendingConfigUpdate = true
			} else {
				await this.withTimeout(this.updateAllGenerators(), 3000, 'updateAllGenerators')
			}
		} catch (err) {
			console.error('[CubiomesBiomeLayer] updateConfig failed:', err)
			await this.resetWorkerPool('config update failed')
		} finally {
			this.isUpdating = false
		}

		if (this.isDisposed || updateId !== this.configUpdateId) return
		this.invalidateAndRedraw()
	}

	private async initWorkerPool() {
		console.log(`[CubiomesBiomeLayer] Initializing worker pool with ${this.workerPoolSize} workers`)

		try {
			const initPromises = Array.from({ length: this.workerPoolSize }, (_, i) =>
				this.createWorkerInstance(i)
			)

			const results = await Promise.allSettled(initPromises)

			if (this.isDisposed) {
				for (const result of results) {
					if (result.status === 'fulfilled' && result.value) {
						result.value.worker.terminate()
					}
				}
				return
			}

			for (const result of results) {
				if (result.status === 'fulfilled' && result.value) {
					this.workers.push(result.value)
				}
			}

			if (this.workers.length === 0) {
				throw new Error('No workers could be initialized')
			}

			console.log(`[CubiomesBiomeLayer] Worker pool ready: ${this.workers.length}/${this.workerPoolSize} workers`)

			if (this.isDisposed) {
				this.terminateAllWorkers()
				return
			}

			this.isPoolReady = true

			if (this.pendingConfigUpdate) {
				this.pendingConfigUpdate = false
				await this.updateAllGenerators()
			}

			if (this.isDisposed) {
				this.terminateAllWorkers()
				return
			}

			this.processTaskQueue()

		} catch (error) {
			console.error('[CubiomesBiomeLayer] Failed to init worker pool:', error)
			this.initFailed = true
			this.failAllQueuedTasks()
		}
	}

	private failAllQueuedTasks() {
		while (this.taskQueue.length > 0) {
			const task = this.taskQueue.shift()!
			this.finishTask(task)
		}
	}

	private async createWorkerInstance(index: number): Promise<WorkerInstance> {
		// Use module worker for cubiomes
		const workerUrl = new URL('../cubiomes/cubiomes-worker.ts', import.meta.url)
		const worker = new Worker(workerUrl, { type: 'module' })
		const generator = Comlink.wrap<CubiomesGenerator>(worker)

		// Initialize WASM
		await generator.initialize('/wasm/cubiomes.wasm')

		// Configure generator with current settings
		await this.configureGenerator(generator)

		console.log(`[CubiomesBiomeLayer] Worker ${index} initialized`)

		return {
			worker,
			generator,
			busy: false,
			ready: true,
			index,
			currentTask: null
		}
	}

	private async configureGenerator(generator: Comlink.Remote<CubiomesGenerator>) {
		const version = parseVersion(this.settingsStore.mc_version)
		const dimension = DIMENSION_MAP[this.settingsStore.dimension.toString()] ?? 0
		const largeBiomes = this.settingsStore.world_preset.toString() === 'minecraft:large_biomes'

		if (DEBUG) {
			console.log('[CubiomesBiomeLayer] configureGenerator:', {
				seed: this.settingsStore.seed,
				version,
				dimension,
				largeBiomes
			})
		}

		generator.configure(
			this.settingsStore.seed,
			this.tileSize,
			0,
			version.major,
			version.minor,
			version.patch,
			dimension,
			largeBiomes
		)
	}

	private async updateAllGenerators() {
		const updatePromises = this.workers.map(async (w) => {
			if (w.ready) {
				await this.configureGenerator(w.generator)
			}
		})
		await Promise.all(updatePromises)
	}

	private terminateAllWorkers() {
		for (const w of this.workers) {
			w.worker.terminate()
		}
		this.workers = []
	}

	private async resetWorkerPool(reason: string) {
		console.log(`[CubiomesBiomeLayer] Resetting worker pool: ${reason}`)
		this.isPoolReady = false
		this.terminateAllWorkers()
		this.failAllQueuedTasks()
		await this.initWorkerPool()
	}

	private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
		let timeoutId: ReturnType<typeof setTimeout>
		const timeout = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
		})
		try {
			const result = await Promise.race([promise, timeout])
			clearTimeout(timeoutId!)
			return result
		} catch (e) {
			clearTimeout(timeoutId!)
			throw e
		}
	}

	createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
		const canvas = L.DomUtil.create('canvas') as HTMLCanvasElement
		canvas.width = this.tileSize
		canvas.height = this.tileSize
		const ctx = canvas.getContext('2d')!

		const key = `${coords.z}:${coords.x}:${coords.y}`
		const requestId = this.currentRequestId

		this.Tiles[key] = {
			coords,
			canvas,
			ctx,
			done,
			pending: true,
			requestId
		}

		if (this.initFailed) {
			ctx.fillStyle = '#330000'
			ctx.fillRect(0, 0, this.tileSize, this.tileSize)
			done(undefined, canvas)
			return canvas
		}

		this.queueTileTask(key, coords, requestId, done)
			.then((buffer) => {
				if (buffer && this.Tiles[key]?.requestId === requestId) {
					this.renderBmpToCanvas(buffer, ctx)
				}
			})
			.catch((err) => {
				console.error('[CubiomesBiomeLayer] Tile error:', err)
			})
			.finally(() => {
				if (this.Tiles[key]?.requestId === requestId) {
					this.Tiles[key].pending = false
					done(undefined, canvas)
				}
			})

		return canvas
	}

	private renderBmpToCanvas(buffer: ArrayBuffer, ctx: CanvasRenderingContext2D) {
		const view = new DataView(buffer)
		const pixelOffset = view.getUint32(10, true)
		const width = view.getInt32(18, true)
		const height = Math.abs(view.getInt32(22, true))

		const imageData = ctx.createImageData(width, height)
		const rowSize = Math.ceil((width * 3) / 4) * 4

		for (let y = 0; y < height; y++) {
			const srcRow = height - 1 - y
			const srcOffset = pixelOffset + srcRow * rowSize

			for (let x = 0; x < width; x++) {
				const srcIdx = srcOffset + x * 3
				const dstIdx = (y * width + x) * 4

				imageData.data[dstIdx] = view.getUint8(srcIdx + 2)     // R
				imageData.data[dstIdx + 1] = view.getUint8(srcIdx + 1) // G
				imageData.data[dstIdx + 2] = view.getUint8(srcIdx)     // B
				imageData.data[dstIdx + 3] = 255                        // A
			}
		}

		ctx.putImageData(imageData, 0, 0)
	}

	private queueTileTask(key: string, coords: L.Coords, requestId: number, done: L.DoneCallback): Promise<ArrayBuffer | null> {
		return new Promise((resolve) => {
			this.taskQueue.push({ key, coords, requestId, resolve, done })
			this.processTaskQueue()
		})
	}

	private processTaskQueue() {
		if (!this.isPoolReady || this.isUpdating) return

		const idleWorker = this.workers.find(w => w.ready && !w.busy)
		if (!idleWorker) return

		const task = this.taskQueue.shift()
		if (!task) return

		idleWorker.busy = true
		idleWorker.currentTask = task
		this.executeTask(idleWorker, task)
	}

	private async executeTask(worker: WorkerInstance, task: TileTask) {
		try {
			if (task.requestId !== this.currentRequestId) {
				this.finishTask(task)
				return
			}

			const coords = task.coords
			const baseTileSize = 256
			const tileSizeShift = Math.round(Math.log2(this.tileSize / baseTileSize))
			const zoomOffset = coords.z - tileSizeShift
			const tileBlockSize = zoomOffset < 0
				? baseTileSize << -zoomOffset
				: baseTileSize >> zoomOffset
			const blockX = coords.x * tileBlockSize
			const blockZ = coords.y * tileBlockSize

			const shaderKind = this.do_hillshade.value ? ShaderKind.Simple : ShaderKind.None
			const contourKind = ContourKind.None
			const heightScale = 4
			let heightmap: Float32Array | undefined
			let heightmapWidth: number | undefined
			let heightmapHeight: number | undefined

			const randomState = this.loadedDimensionStore.random_state
			const noiseSettings = this.loadedDimensionStore.noise_generator_settings.noise
			const densityFn = randomState?.router?.initialDensityWithoutJaggedness
			if (shaderKind !== ShaderKind.None && densityFn && this.settingsStore.dimension.toString() === 'minecraft:overworld') {
				const cellHeight = NoiseSettings.cellHeight(noiseSettings)
				const maxY = noiseSettings.minY + noiseSettings.height
				const gridWidth = Math.ceil(tileBlockSize / heightScale) + 2
				const gridHeight = gridWidth
				const quartX = Math.floor(blockX / heightScale) - 1
				const quartZ = Math.floor(blockZ / heightScale) - 1
				const data = new Float32Array(gridWidth * gridHeight)
				let idx = 0
				const threshold = 0.390625
				const bisectIterations = 5
				for (let gz = 0; gz < gridHeight; gz++) {
					const worldZ = (quartZ + gz) * heightScale
					for (let gx = 0; gx < gridWidth; gx++) {
						const worldX = (quartX + gx) * heightScale
						let height = noiseSettings.minY
						let prevY = maxY
						let prevD = densityFn.compute(DensityFunction.context(worldX, prevY, worldZ))

						if (prevD > threshold) {
							height = prevY
						} else {
							for (let y = maxY - cellHeight; y >= noiseSettings.minY; y -= cellHeight) {
								const d = densityFn.compute(DensityFunction.context(worldX, y, worldZ))
								if (prevD <= threshold && d > threshold) {
									// 跨越點找到，做二分搜尋
									let low = y
									let high = prevY
									for (let i = 0; i < bisectIterations; i++) {
										const mid = (low + high) * 0.5
										const dm = densityFn.compute(DensityFunction.context(worldX, mid, worldZ))
										if (dm > threshold) {
											low = mid
										} else {
											high = mid
										}
									}
									height = (low + high) * 0.5
									break
								}
								prevY = y
								prevD = d
							}
						}
						data[idx++] = height
					}
				}
				heightmap = data
				heightmapWidth = gridWidth
				heightmapHeight = gridHeight
			}

			const buffer = await worker.generator.generateBiomeImage(
				zoomOffset,
				blockX,
				blockZ,
				this.y.value,
				shaderKind,
				contourKind,
				false,
				false,
				false,
				new Uint16Array(),
				new Uint16Array(),
				0,
				DEFAULT_MAX_BIOME_ID,
				false,
				heightmap ? Comlink.transfer(heightmap, [heightmap.buffer]) : undefined,
				heightmapWidth,
				heightmapHeight,
				heightmap ? heightScale : undefined
			)

			if (task.requestId === this.currentRequestId) {
				task.resolve(buffer)
				this.lastTileRenderedAt = Date.now()
				this.tileRenderCount++
				if (DEBUG && this.tileRenderCount % 50 === 0) {
					console.log(`[CubiomesBiomeLayer] Rendered ${this.tileRenderCount} tiles`)
				}
			} else {
				this.finishTask(task)
			}

		} catch (error) {
			console.error('[CubiomesBiomeLayer] Task error:', error)

			const isRuntime = (error as any)?.name === 'RuntimeError'
			const now = Date.now()
			if (isRuntime && !this.runtimeResetInFlight && now - this.lastRuntimeResetAt > 5000) {
				this.runtimeResetInFlight = true
				this.lastRuntimeResetAt = now
				console.warn('[CubiomesBiomeLayer] RuntimeError detected, resetting workers')
				try {
					await this.resetWorkerPool('runtime error')
					this.invalidateAndRedraw()
				} catch (resetErr) {
					console.error('[CubiomesBiomeLayer] Reset failed:', resetErr)
				} finally {
					this.runtimeResetInFlight = false
				}
			}

			this.finishTask(task)
		} finally {
			worker.busy = false
			worker.currentTask = null
			this.processTaskQueue()
		}
	}

	private finishTask(task: TileTask) {
		task.resolve(null)
	}

	private invalidateAndRedraw() {
		this.currentRequestId++

		while (this.taskQueue.length > 0) {
			const task = this.taskQueue.shift()!
			this.finishTask(task)
		}

		this.redraw()
	}

	onRemove(map: L.Map): this {
		this.isDisposed = true
		this.terminateAllWorkers()
		return super.onRemove(map)
	}
}
