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
	pending: boolean
}

/**
 * BiomeLayer using mcseedmap.net's original WASM for pixel-perfect rendering
 */
export class McseedmapBiomeLayer extends L.GridLayer {
	private Tiles: { [key: string]: Tile } = {}
	private tileSize = 256
	private settingsStore = useSettingsStore()
	private generator: Comlink.Remote<SeedmapGenerator> | null = null
	private worker: Worker | null = null
	private isReady = false
	private pendingTasks: Array<{ key: string; coords: L.Coords }> = []

	constructor(
		options: L.GridLayerOptions,
		private do_hillshade: Ref<boolean>,
		private y: Ref<number>
	) {
		super(options)
		this.tileSize = options.tileSize as number

		this.initWorker()

		// Watch for hillshade toggle
		watch(do_hillshade, () => {
			this.redraw()
		})

		// Watch for Y level changes
		watch(y, () => {
			this.redraw()
		})

		// Watch for seed changes
		watch(() => this.settingsStore.seed, () => {
			this.updateGenerator()
			this.redraw()
		})

		// Watch for version changes (need to reload btree for different versions)
		watch(() => this.settingsStore.mc_version, async () => {
			await this.updateGenerator()  // Configure first (may recreate generator)
			await this.loadBtree()        // Then load btree into new generator
			this.redraw()
		})

		// Watch for dimension changes
		watch(() => this.settingsStore.dimension, () => {
			this.updateGenerator()
			this.redraw()
		})
	}

	private async initWorker() {
		try {
			// Create worker from mcseedmap's original worker.js
			// Note: worker.js is an IIFE, not ES module
			const workerUrl = new URL('../mcseedmap/mcseedmap-worker.js', import.meta.url)
			console.log('[McseedmapBiomeLayer] Worker URL:', workerUrl.href)
			this.worker = new Worker(workerUrl, { type: 'classic' })

			// Wrap with Comlink
			this.generator = Comlink.wrap<SeedmapGenerator>(this.worker)

			// Initialize WASM
			const wasmUrl = new URL('../mcseedmap/mcseedmap.wasm', import.meta.url)
			console.log('[McseedmapBiomeLayer] WASM URL:', wasmUrl.href)
			await this.generator.initialize(wasmUrl.href)
			console.log('[McseedmapBiomeLayer] WASM loaded')

			// Set biome colors (must be before configure)
			await this.generator.setColors(BIOME_COLORS)
			console.log('[McseedmapBiomeLayer] Colors set')

			// Configure generator first (creates the SmGenerator instance)
			await this.updateGenerator()
			console.log('[McseedmapBiomeLayer] Generator configured')

			// Load btree resource AFTER generator is created
			await this.loadBtree()
			console.log('[McseedmapBiomeLayer] Btree loaded')

			this.isReady = true
			console.log('[McseedmapBiomeLayer] Worker initialized')

			// Process pending tasks
			this.processPendingTasks()
		} catch (error) {
			console.error('[McseedmapBiomeLayer] Failed to init worker:', error)
		}
	}

	private async updateGenerator() {
		if (!this.generator) return

		const version = parseVersion(this.settingsStore.mc_version)
		const dimension = DIMENSION_MAP[this.settingsStore.dimension.toString()] ?? 0
		const largeBiomes = this.settingsStore.world_preset.toString() === 'minecraft:large_biomes'

		console.log('[McseedmapBiomeLayer] Configuring:', {
			seed: this.settingsStore.seed.toString(),
			version,
			dimension,
			largeBiomes
		})

		try {
			await this.generator.configure(
				this.settingsStore.seed,
				256,  // tileSize for WASM (與 Leaflet tileSize 對齊，避免放大導致線條變粗)
				0,   // library: 0 = Java
				version.major,
				version.minor,
				version.patch,
				dimension,
				largeBiomes
			)
		} catch (error) {
			console.error('[McseedmapBiomeLayer] Configure failed:', error)
		}
	}

	private async loadBtree() {
		if (!this.generator) return

		const version = parseVersion(this.settingsStore.mc_version)
		const btreeFile = getBtreeFile(version.major, version.minor, version.patch)
		const btreeUrl = new URL(`../mcseedmap/btree/${btreeFile}`, import.meta.url).href

		// Check if already loaded
		const currentBtreeUrl = await this.generator.getBiomeTreeUrl()
		if (currentBtreeUrl === btreeUrl) {
			console.log('[McseedmapBiomeLayer] Btree already loaded:', btreeFile)
			return
		}

		console.log('[McseedmapBiomeLayer] Loading btree:', btreeFile)

		try {
			const response = await fetch(btreeUrl)
			if (!response.ok) {
				throw new Error(`Failed to fetch btree: ${response.status}`)
			}
			const arrayBuffer = await response.arrayBuffer()
			const btreeData = new Uint8Array(arrayBuffer)

			await this.generator.setBiomeTree(btreeData, btreeUrl)
			console.log('[McseedmapBiomeLayer] Btree set, size:', btreeData.byteLength)
		} catch (error) {
			console.error('[McseedmapBiomeLayer] Failed to load btree:', error)
		}
	}

	private processPendingTasks() {
		while (this.pendingTasks.length > 0) {
			const task = this.pendingTasks.shift()!
			this.generateTile(task.key, task.coords)
		}
	}

	private async generateTile(key: string, coords: L.Coords) {
		if (!this.generator || !this.isReady) {
			this.pendingTasks.push({ key, coords })
			return
		}

		const tile = this.Tiles[key]
		if (!tile) return

		try {
			const renderSize = 64
			const baseTileSize = 256  // 與 WASM tileSize 和 Leaflet tileSize 對齊
			const tileSizeShift = Math.round(Math.log2(this.tileSize / baseTileSize))
			const zoomOffset = coords.z - tileSizeShift
			const tileBlockSize = zoomOffset < 0
				? baseTileSize << -zoomOffset
				: baseTileSize >> zoomOffset
			const blockX = coords.x * tileBlockSize
			const blockZ = coords.y * tileBlockSize

			const shaderKind = this.do_hillshade.value ? ShaderKind.Simple : ShaderKind.None
			const contourKind = shaderKind !== ShaderKind.None ? ContourKind.None : ContourKind.None

			const buffer = await this.generator.generateBiomeImage(
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

			// The WASM returns a BMP image (54-byte header + pixel data)
			// Use createImageBitmap to decode it
			const blob = new Blob([buffer], { type: 'image/bmp' })
			const imageBitmap = await createImageBitmap(blob)

			// Draw to tile canvas with nearest-neighbor scaling (no smoothing!)
			tile.ctx.imageSmoothingEnabled = false
			tile.ctx.clearRect(0, 0, this.tileSize, this.tileSize)
			tile.ctx.drawImage(imageBitmap, 0, 0, this.tileSize, this.tileSize)
			imageBitmap.close()

			tile.done()
			tile.pending = false
		} catch (error) {
			console.error('[McseedmapBiomeLayer] Error generating tile:', error)
			tile.done()
			tile.pending = false
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
			pending: true
		}

		this.generateTile(key, coords)

		return tile
	}

	_removeTile(key: string) {
		delete this.Tiles[key]
		// @ts-expect-error: _removeTile does not exist
		L.TileLayer.prototype._removeTile.call(this, key)
	}
}
