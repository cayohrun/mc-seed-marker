import * as L from "leaflet"
import * as Comlink from "comlink"
import { useSettingsStore } from "../stores/useSettingsStore.js"
import { Ref, watch } from "vue"

// ShaderKind enum matching mcseedmap.net
enum ShaderKind {
	None = 0,
	Simple = 1,
	Stepped = 2
}

// ContourKind enum matching mcseedmap.net
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

// Worker pool size calculation (safe for SSR/Node environments)
function getWorkerPoolSize(): number {
	if (typeof navigator === 'undefined') return 4  // SSR/Node fallback
	return Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1))
}

// mcseedmap.net biome colors (decimal format)
const BIOME_COLORS: number[] = [
	// Index 0-127: Overworld biomes (order matches mcseedmap internal biome IDs)
	112,        // 0: ocean
	9286496,    // 1: plains
	16421912,   // 2: desert
	6316128,    // 3: windswept_hills
	353825,     // 4: forest
	748127,     // 5: taiga
	522674,     // 6: swamp
	255,        // 7: river
	0,          // 8: nether_wastes (placeholder)
	0,          // 9: the_end (placeholder)
	7368918,    // 10: frozen_ocean
	10526975,   // 11: frozen_river
	16777215,   // 12: snowy_plains
	16777215,   // 13: snowy_mountains (legacy)
	16711935,   // 14: mushroom_fields
	16711935,   // 15: mushroom_field_shore (legacy)
	16445632,   // 16: beach
	16421912,   // 17: desert_hills (legacy)
	353825,     // 18: wooded_hills (legacy)
	6316128,    // 19: taiga_hills (legacy)
	6316128,    // 20: mountain_edge (legacy)
	5274378,    // 21: jungle
	5274378,    // 22: jungle_hills (legacy)
	6329103,    // 23: sparse_jungle
	48,         // 24: deep_ocean
	10658436,   // 25: stony_shore
	16440917,   // 26: snowy_beach
	3175492,    // 27: birch_forest
	3175492,    // 28: birch_forest_hills (legacy)
	4215066,    // 29: dark_forest
	3233098,    // 30: snowy_taiga
	3233098,    // 31: snowy_taiga_hills (legacy)
	5858897,    // 32: old_growth_pine_taiga
	5858897,    // 33: old_growth_pine_taiga_hills (legacy)
	5993298,    // 34: windswept_forest
	12431967,   // 35: savanna
	10984804,   // 36: savanna_plateau
	14238997,   // 37: badlands
	13274213,   // 38: wooded_badlands
	14238997,   // 39: badlands_plateau (legacy)
	2105456,    // 40: small_end_islands
	2105456,    // 41: end_midlands
	2105456,    // 42: end_highlands
	2105456,    // 43: end_barrens
	172,        // 44: warm_ocean
	144,        // 45: lukewarm_ocean
	2105456,    // 46: cold_ocean
	4210832,    // 47: deep_frozen_ocean
	64,         // 48: deep_lukewarm_ocean
	2105400,    // 49: deep_cold_ocean
	0,          // 50: the_void
	11918216,   // 51: sunflower_plains
	16421912,   // 52: desert_lakes (legacy)
	8947848,    // 53: windswept_gravelly_hills
	2985545,    // 54: flower_forest
	6316128,    // 55: taiga_mountains (legacy)
	522674,     // 56: swamp_hills (legacy)
	11853020,   // 57: ice_spikes
	5274378,    // 58: modified_jungle (legacy)
	5274378,    // 59: modified_jungle_edge (legacy)
	5807212,    // 60: old_growth_birch_forest
	5807212,    // 61: tall_birch_hills (legacy)
	4215066,    // 62: dark_forest_hills (legacy)
	3233098,    // 63: snowy_taiga_mountains (legacy)
	8490617,    // 64: old_growth_spruce_taiga
	8490617,    // 65: giant_spruce_taiga_hills (legacy)
	5993298,    // 66: modified_gravelly_mountains (legacy)
	15063687,   // 67: windswept_savanna
	10984804,   // 68: shattered_savanna_plateau (legacy)
	16739645,   // 69: eroded_badlands
	13274213,   // 70: modified_wooded_badlands_plateau (legacy)
	14238997,   // 71: modified_badlands_plateau (legacy)
	8688896,    // 72: bamboo_jungle
	8688896,    // 73: bamboo_jungle_hills (legacy)
	// 74-127: Extended biomes (1.18+)
	4934475,    // 74: soul_sand_valley
	4802889,    // 75: crimson_forest
	7502946,    // 76: warped_forest
	3355443,    // 77: basalt_deltas
	5124114,    // 78: dripstone_caves
	2636800,    // 79: lush_caves
	204585,     // 80: deep_dark
	6333509,    // 81: meadow
	4682348,    // 82: grove
	12895428,   // 83: snowy_slopes
	11580366,   // 84: frozen_peaks
	14474440,   // 85: jagged_peaks
	8097652,    // 86: stony_peaks
	16749600,   // 87: cherry_grove
	2935950,    // 88: mangrove_swamp
	6909333,    // 89: pale_garden
]

// Pad to 256 with zeros
while (BIOME_COLORS.length < 256) {
	BIOME_COLORS.push(0)
}

interface SeedmapGenerator {
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
		showSlime: boolean
	): Promise<ArrayBuffer>
}

// Worker instance in the pool
interface WorkerInstance {
	worker: Worker
	generator: Comlink.Remote<SeedmapGenerator>
	busy: boolean
	ready: boolean
	index: number  // Worker index for rebuilding
	currentTask: TileTask | null  // Currently executing task
}

// Tile generation task
interface TileTask {
	key: string
	coords: L.Coords
	requestId: number
	resolve: (buffer: ArrayBuffer | null) => void
	done: L.DoneCallback  // Captured from createTile, belongs to this specific task
}

// btree file mapping for different MC versions
function getBtreeFile(major: number, minor: number, patch: number): string {
	if (minor === 18) return 'btree18.dat'
	if (minor === 19) {
		return patch >= 2 ? 'btree192.dat' : 'btree19.dat'
	}
	if (minor === 20) return 'btree20.dat'
	if (minor === 21) {
		return patch >= 5 ? 'btree215.dat' : 'btree21wd.dat'
	}
	// Default to latest
	return 'btree215.dat'
}

type Tile = {
	coords: L.Coords,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	done: L.DoneCallback,
	pending: boolean,
	requestId: number  // For task cancellation
}

/**
 * BiomeLayer using mcseedmap.net's original WASM for pixel-perfect rendering
 * with multi-worker parallel processing for improved performance
 */
export class McseedmapBiomeLayer extends L.GridLayer {
	private Tiles: { [key: string]: Tile } = {}
	private tileSize = 256
	private settingsStore = useSettingsStore()

	// Worker pool
	private workers: WorkerInstance[] = []
	private isPoolReady = false
	private initPromise: Promise<void> | null = null
	private initFailed = false
	private workerPoolSize: number

	// Task management
	private taskQueue: TileTask[] = []
	private currentRequestId = 0

	// Cached resources (shared across all workers)
	private btreeCache: Map<string, Uint8Array> = new Map()
	private currentBtreeUrl: string | null = null
	private btreeLoadId = 0  // Version lock for btree loading

	// Pending updates during initialization
	private pendingConfigUpdate = false
	private pendingBtreeUpdate = false

	// Update barrier: blocks task processing during config updates
	private isUpdating = false

	// Config update version lock (prevents stale updates from overwriting)
	private configUpdateId = 0

	// Disposed flag: prevents operations after layer removal
	private isDisposed = false

	// URLs for worker initialization
	private workerUrl: URL
	private wasmUrl: URL

	constructor(
		options: L.GridLayerOptions,
		private do_hillshade: Ref<boolean>,
		private y: Ref<number>
	) {
		super(options)
		this.tileSize = options.tileSize as number
		this.workerPoolSize = getWorkerPoolSize()

		// Pre-compute URLs
		this.workerUrl = new URL('../mcseedmap/mcseedmap-worker.js', import.meta.url)
		this.wasmUrl = new URL('../mcseedmap/mcseedmap.wasm', import.meta.url)

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
		// Must wait for worker update before redraw
		watch(() => this.settingsStore.seed, () => {
			this.updateConfigThenRedraw().catch(this.logError)
		})

		// Watch for version changes (need to reload btree for different versions)
		watch(() => this.settingsStore.mc_version, () => {
			this.updateConfigAndBtreeThenRedraw().catch(this.logError)
		})

		// Watch for dimension changes
		watch(() => this.settingsStore.dimension, () => {
			this.updateConfigThenRedraw().catch(this.logError)
		})
	}

	/**
	 * Error handler for async operations
	 */
	private logError = (error: unknown) => {
		console.error('[McseedmapBiomeLayer] Async error:', error)
	}

	/**
	 * Update config then redraw (with barrier and version lock)
	 */
	private async updateConfigThenRedraw() {
		if (this.isDisposed) return

		// Version lock: get current update ID
		const updateId = ++this.configUpdateId

		// Set barrier to pause task processing
		this.isUpdating = true

		try {
			if (!this.isPoolReady) {
				this.pendingConfigUpdate = true
			} else {
				await this.updateAllGenerators()
			}
		} finally {
			this.isUpdating = false
		}

		// Check if this update is still valid (no newer update started)
		if (this.isDisposed || updateId !== this.configUpdateId) return

		// Now redraw with updated config
		this.invalidateAndRedraw()
	}

	/**
	 * Update config and btree then redraw (with barrier and version lock)
	 */
	private async updateConfigAndBtreeThenRedraw() {
		if (this.isDisposed) return

		// Version lock: get current update ID
		const updateId = ++this.configUpdateId

		// Set barrier to pause task processing
		this.isUpdating = true

		try {
			if (!this.isPoolReady) {
				this.pendingConfigUpdate = true
				this.pendingBtreeUpdate = true
			} else {
				await this.updateAllGenerators()
				await this.loadAndDistributeBtree()
			}
		} finally {
			this.isUpdating = false
		}

		// Check if this update is still valid (no newer update started)
		if (this.isDisposed || updateId !== this.configUpdateId) return

		// Now redraw with updated config
		this.invalidateAndRedraw()
	}

	/**
	 * Initialize the worker pool with multiple workers
	 */
	private async initWorkerPool() {
		console.log(`[McseedmapBiomeLayer] Initializing worker pool with ${this.workerPoolSize} workers`)

		try {
			// Create all workers in parallel
			const initPromises = Array.from({ length: this.workerPoolSize }, (_, i) =>
				this.createWorkerInstance(i)
			)

			const results = await Promise.allSettled(initPromises)

			// Check if disposed during init
			if (this.isDisposed) {
				// Terminate any workers that were created
				for (const result of results) {
					if (result.status === 'fulfilled' && result.value) {
						result.value.worker.terminate()
					}
				}
				return
			}

			// Add successfully created workers to pool
			for (const result of results) {
				if (result.status === 'fulfilled' && result.value) {
					this.workers.push(result.value)
				}
			}

			if (this.workers.length === 0) {
				throw new Error('No workers could be initialized')
			}

			console.log(`[McseedmapBiomeLayer] Worker pool ready: ${this.workers.length}/${this.workerPoolSize} workers`)

			// Check disposed again before continuing
			if (this.isDisposed) {
				this.terminateAllWorkers()
				return
			}

			// Load btree into all workers
			await this.loadAndDistributeBtree()

			// Check disposed after btree load
			if (this.isDisposed) {
				this.terminateAllWorkers()
				return
			}

			this.isPoolReady = true

			// Apply any pending updates that occurred during initialization
			if (this.pendingConfigUpdate) {
				this.pendingConfigUpdate = false
				await this.updateAllGenerators()
			}
			if (this.pendingBtreeUpdate) {
				this.pendingBtreeUpdate = false
				await this.loadAndDistributeBtree()
			}

			// Final disposed check
			if (this.isDisposed) {
				this.terminateAllWorkers()
				return
			}

			// Process any queued tasks
			this.processTaskQueue()

		} catch (error) {
			console.error('[McseedmapBiomeLayer] Failed to init worker pool:', error)
			this.initFailed = true
			// Fail all queued tasks so tiles don't hang
			this.failAllQueuedTasks()
		}
	}

	/**
	 * Fail all queued tasks (called when initialization fails)
	 */
	private failAllQueuedTasks() {
		while (this.taskQueue.length > 0) {
			const task = this.taskQueue.shift()!
			this.finishTask(task)
		}
	}

	/**
	 * Create and initialize a single worker instance
	 */
	private async createWorkerInstance(index: number): Promise<WorkerInstance> {
		const worker = new Worker(this.workerUrl, { type: 'classic' })
		const generator = Comlink.wrap<SeedmapGenerator>(worker)

		// Initialize WASM
		await generator.initialize(this.wasmUrl.href)

		// Set biome colors
		await generator.setColors(BIOME_COLORS)

		// Configure generator
		await this.configureGenerator(generator)

		console.log(`[McseedmapBiomeLayer] Worker ${index} initialized`)

		return {
			worker,
			generator,
			busy: false,
			ready: true,
			index,
			currentTask: null
		}
	}

	/**
	 * Configure a single generator with current settings
	 */
	private async configureGenerator(generator: Comlink.Remote<SeedmapGenerator>) {
		const version = parseVersion(this.settingsStore.mc_version)
		const dimension = DIMENSION_MAP[this.settingsStore.dimension.toString()] ?? 0
		const largeBiomes = this.settingsStore.world_preset.toString() === 'minecraft:large_biomes'

		await generator.configure(
			this.settingsStore.seed,
			256,  // tileSize for WASM
			0,    // library: 0 = Java
			version.major,
			version.minor,
			version.patch,
			dimension,
			largeBiomes
		)
	}

	/**
	 * Update configuration for all workers
	 */
	private async updateAllGenerators() {
		if (!this.isPoolReady) return

		console.log('[McseedmapBiomeLayer] Updating all generators')

		const updatePromises = this.workers.map(w => this.configureGenerator(w.generator))
		await Promise.all(updatePromises)
	}

	/**
	 * Load btree once and distribute to all workers
	 * Uses version lock to prevent race conditions during rapid version changes
	 */
	private async loadAndDistributeBtree() {
		if (this.workers.length === 0) return

		const version = parseVersion(this.settingsStore.mc_version)
		const btreeFile = getBtreeFile(version.major, version.minor, version.patch)
		const btreeUrl = new URL(`../mcseedmap/btree/${btreeFile}`, import.meta.url).href

		// Check cache first
		if (this.currentBtreeUrl === btreeUrl) {
			console.log('[McseedmapBiomeLayer] Btree already loaded:', btreeFile)
			return
		}

		// Version lock: increment load ID to invalidate any in-flight requests
		const loadId = ++this.btreeLoadId
		console.log('[McseedmapBiomeLayer] Loading btree:', btreeFile, 'loadId:', loadId)

		try {
			// Fetch btree data (once)
			let btreeData = this.btreeCache.get(btreeUrl)
			if (!btreeData) {
				const response = await fetch(btreeUrl)
				if (!response.ok) {
					throw new Error(`Failed to fetch btree: ${response.status}`)
				}
				const arrayBuffer = await response.arrayBuffer()
				btreeData = new Uint8Array(arrayBuffer)
				this.btreeCache.set(btreeUrl, btreeData)
				console.log('[McseedmapBiomeLayer] Btree fetched, size:', btreeData.byteLength)
			}

			// Check if this load is still valid (no newer request started)
			if (loadId !== this.btreeLoadId) {
				console.log('[McseedmapBiomeLayer] Btree load cancelled (stale):', btreeFile)
				return
			}

			// Distribute to all workers in parallel
			const distributePromises = this.workers.map(w =>
				w.generator.setBiomeTree(btreeData!, btreeUrl)
			)
			await Promise.all(distributePromises)

			// Final check before committing
			if (loadId !== this.btreeLoadId) {
				console.log('[McseedmapBiomeLayer] Btree distribution cancelled (stale):', btreeFile)
				return
			}

			this.currentBtreeUrl = btreeUrl
			console.log('[McseedmapBiomeLayer] Btree distributed to all workers')

		} catch (error) {
			console.error('[McseedmapBiomeLayer] Failed to load btree:', error)
		}
	}

	/**
	 * Get an idle worker from the pool
	 */
	private getIdleWorker(): WorkerInstance | null {
		return this.workers.find(w => w.ready && !w.busy) || null
	}

	/**
	 * Finish a task (resolve with null and call its done callback)
	 * This uses the task's own done callback, not the current tile's
	 */
	private finishTask(task: TileTask) {
		task.resolve(null)
		task.done()
	}

	/**
	 * Process tasks from the queue using available workers
	 */
	private processTaskQueue() {
		// Don't process if update barrier is active
		if (this.isUpdating) return

		while (this.taskQueue.length > 0) {
			const worker = this.getIdleWorker()
			if (!worker) break

			const task = this.taskQueue.shift()!
			this.executeTask(worker, task)
		}
	}

	/**
	 * Execute a tile generation task on a specific worker
	 */
	private async executeTask(worker: WorkerInstance, task: TileTask) {
		worker.busy = true
		worker.currentTask = task

		try {
			// Check if task is still valid (request not stale)
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

			const buffer = await worker.generator.generateBiomeImage(
				zoomOffset,
				blockX,
				blockZ,
				this.y.value,
				shaderKind,
				contourKind,
				false, // useFade
				false, // useDesaturate
				false, // useHighlight
				new Uint16Array(),
				new Uint16Array(),
				0, // fadeColor
				DEFAULT_MAX_BIOME_ID,
				false // showSlime
			)

			// Check again if task is still valid after async operation
			if (task.requestId === this.currentRequestId) {
				task.resolve(buffer)
			} else {
				this.finishTask(task)
			}

		} catch (error) {
			console.error('[McseedmapBiomeLayer] Task execution error:', error)
			this.finishTask(task)
		} finally {
			worker.busy = false
			worker.currentTask = null
			this.processTaskQueue()
		}
	}

	/**
	 * Invalidate all pending tasks and redraw
	 */
	private invalidateAndRedraw() {
		// Increment request ID to invalidate all pending tasks
		this.currentRequestId++

		// Finish all queued tasks (using their own done callbacks)
		while (this.taskQueue.length > 0) {
			const task = this.taskQueue.shift()!
			this.finishTask(task)
		}

		// Redraw (workers keep running, stale results will be discarded via requestId check)
		this.redraw()
	}

	/**
	 * Queue a tile generation task
	 */
	private queueTileTask(key: string, coords: L.Coords, requestId: number, done: L.DoneCallback): Promise<ArrayBuffer | null> {
		return new Promise((resolve) => {
			const task: TileTask = { key, coords, requestId, resolve, done }
			this.taskQueue.push(task)

			// Try to process immediately if pool is ready
			if (this.isPoolReady) {
				this.processTaskQueue()
			}
		})
	}

	/**
	 * Generate a tile (main entry point)
	 */
	private async generateTile(key: string, coords: L.Coords, done: L.DoneCallback) {
		// Wait for pool to be ready
		if (this.initPromise) {
			await this.initPromise
		}

		const tile = this.Tiles[key]
		if (!tile) return

		// If initialization failed, mark tile as done immediately
		if (this.initFailed) {
			done()
			return
		}

		const requestId = tile.requestId

		// Queue task with this tile's done callback
		// If task is cancelled, finishTask() will call done()
		// If task succeeds, we get buffer and call done() here
		const buffer = await this.queueTileTask(key, coords, requestId, done)

		// If buffer is null, task was cancelled - finishTask already called done()
		if (!buffer) return

		try {
			// Check if tile still exists and matches our request
			const currentTile = this.Tiles[key]
			if (!currentTile || currentTile.requestId !== requestId) {
				// Tile was replaced - don't render, but still need to call our done
				done()
				return
			}

			// The WASM returns a BMP image (54-byte header + pixel data)
			const blob = new Blob([buffer], { type: 'image/bmp' })
			const imageBitmap = await createImageBitmap(blob)

			// Draw to tile canvas with nearest-neighbor scaling (no smoothing!)
			currentTile.ctx.imageSmoothingEnabled = false
			currentTile.ctx.clearRect(0, 0, this.tileSize, this.tileSize)
			currentTile.ctx.drawImage(imageBitmap, 0, 0, this.tileSize, this.tileSize)
			imageBitmap.close()

			// Success - call done for this tile
			done()
		} catch (error) {
			console.error('[McseedmapBiomeLayer] Error rendering tile:', error)
			done()
		}
	}

	createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
		const tile = L.DomUtil.create("canvas", "leaflet-tile")
		tile.width = tile.height = this.tileSize

		tile.onselectstart = tile.onmousemove = L.Util.falseFn

		const ctx = tile.getContext("2d")!

		if (!this._map) {
			return tile
		}

		const key = this._tileCoordsToKey(coords)
		this.Tiles[key] = {
			coords,
			canvas: tile,
			ctx,
			done,
			pending: true,
			requestId: this.currentRequestId
		}

		this.generateTile(key, coords, done)

		return tile
	}

	_removeTile(key: string) {
		delete this.Tiles[key]
		// @ts-expect-error: _removeTile does not exist
		L.TileLayer.prototype._removeTile.call(this, key)
	}

	/**
	 * Clean up workers when layer is removed from map
	 */
	onRemove(map: L.Map): this {
		// Mark as disposed to stop any in-flight operations
		this.isDisposed = true

		// Terminate all workers to free resources
		this.terminateAllWorkers()

		// Call parent onRemove
		// @ts-expect-error: onRemove exists on GridLayer
		return L.GridLayer.prototype.onRemove.call(this, map)
	}

	/**
	 * Terminate all workers and clean up resources
	 */
	private terminateAllWorkers() {
		console.log(`[McseedmapBiomeLayer] Terminating ${this.workers.length} workers`)

		// Finish all pending tasks first (using their own done callbacks)
		while (this.taskQueue.length > 0) {
			const task = this.taskQueue.shift()!
			this.finishTask(task)
		}

		// Terminate each worker
		for (const w of this.workers) {
			w.ready = false
			w.worker.terminate()
		}

		// Clear worker array
		this.workers = []
		this.isPoolReady = false
	}
}
