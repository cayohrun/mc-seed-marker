import * as L from "leaflet"
//import { last, range, takeWhile } from "lodash";
import { Climate } from "deepslate";
import { calculateHillshadeSimple, getCustomDensityFunction, hashCode } from "../util.js";
import MultiNoiseCalculator from "../webworker/MultiNoiseCalculator?worker"
import { useSearchStore } from "../stores/useBiomeSearchStore.js";
import { useLoadedDimensionStore } from "../stores/useLoadedDimensionStore.js";
import { useSettingsStore } from "../stores/useSettingsStore.js";
import { useDatapackStore } from "../stores/useDatapackStore.js";
import { Ref, toRaw, watch } from "vue";
import { ResourceLocation } from "mc-datapack-loader";

const WORKER_COUNT = 4

type Tile = {
	coords: L.Coords,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	done: L.DoneCallback,
	array?: {
		surface: number,
		biome: string,
		terrain: number
	}[][],
	step?: number,
	isRendering?: boolean,
	workerId: number
}

export class BiomeLayer extends L.GridLayer {
	private next_worker_id = 0

	private Tiles: { [key: string]: Tile } = {}
	private tileSize = 0
	private calcResolution = 0

	private workers: Worker[] = []

	private datapackStore = useDatapackStore()
	private loadedDimensionStore = useLoadedDimensionStore()
	private searchStore = useSearchStore()
	private settingsStore = useSettingsStore()

	private datapackLoader: Promise<any> | undefined

	private generationVersion = 0
	private waveImage: Promise<HTMLImageElement>

	constructor(options: L.GridLayerOptions, private do_hillshade: Ref<boolean>, private show_sealevel: Ref<boolean>, private project_down: Ref<boolean>, private y: Ref<number>) {
		super(options)
		this.tileSize = options.tileSize as number
		this.calcResolution = 1 / 4  // 恢復原設定

		this.createWorkers()
		this.datapackLoader = this.updateWorkers({
			dimension: true,
			registires: true,
			settings: true,
		}),

			this.waveImage = new Promise((resolve) => {
				const waveImage = new Image()
				waveImage.onload = () => resolve(waveImage)
				waveImage.src = "images/wave.png"
			})


		watch([this.searchStore.biomes, () => this.searchStore.disabled], ([biomes, disabled], [oldBiomes, oldDisabled]) => {
			// Do not re-render if no biomes were filtered, regardless of the disabled state
			if (oldDisabled !== disabled && oldBiomes.size === 0 && biomes.size === 0) return
			this.rerender() 
		})

		watch(do_hillshade, () => {
			this.rerender()
		})

		watch(show_sealevel, () => {
			this.rerender()
		})

		watch(() => this.settingsStore.contourInterval, () => {
			this.rerender()
		})

		watch(this.project_down, () => {
			this.updateWorkers({
				settings: true
			})
			this.redraw()
		})

		watch(this.y, () => {
			this.updateWorkers({
				settings: true
			})
			this.redraw()
		})

		this.loadedDimensionStore.$subscribe(async (mutation, state) => {
			await this.updateWorkers({
				settings: true,
				dimension: true,
				registires: true
			})
			this.redraw()
		})

	}

	// ===== Draw tiles that have generated biomes =====
	async renderTile(tile: Tile) {
		tile.isRendering = false
		if (tile.array === undefined || tile.step === undefined) {
			console.warn("trying to render empty tile")
			return
		}

		tile.ctx.clearRect(0, 0, this.tileSize, this.tileSize)

		const waveImage = await this.waveImage

		const project_down = this.project_down.value
		const do_hillshade = this.do_hillshade.value
		const show_sealevel = this.show_sealevel.value
		const getBiomeColor = this.loadedDimensionStore.getBiomeColor
		const contourInterval = this.settingsStore.contourInterval
		const gridSize = this.tileSize * this.calcResolution  // 64
		const pixelSize = 1 / this.calcResolution  // 4

		// === 第一階段：繪製生態系+hillshade 到小 canvas，然後用平滑縮放 ===
		// 創建 offscreen canvas（小尺寸）
		const smallCanvas = document.createElement('canvas')
		smallCanvas.width = gridSize
		smallCanvas.height = gridSize
		const smallCtx = smallCanvas.getContext('2d')!

		// 繪製生態系+hillshade 到小 canvas（1:1）
		for (let x = 0; x < gridSize; x++) {
			for (let z = 0; z < gridSize; z++) {
				const biome = tile.array[x + 1][z + 1].biome

				if (this.searchStore.biomes.size > 0
					&& !this.searchStore.biomes.has(biome)
					&& !this.searchStore.disabled
				) {
					continue
				}

				let biomeColor = getBiomeColor(biome)

				// 在小 canvas 階段就套用 hillshade
				if (do_hillshade && project_down) {
					const terrain = tile.array[x + 1]?.[z + 1]?.terrain ?? 0
					let hillshade: number

					if (terrain < 0) {
						// 洞穴/水下區域
						hillshade = 0.15
					} else {
						// 計算該格的 hillshade（使用 cubiomes-viewer 的簡化算法）
						const hE = tile.array[x + 2]?.[z + 1]?.surface ?? tile.array[x + 1][z + 1].surface
						const hW = tile.array[x]?.[z + 1]?.surface ?? tile.array[x + 1][z + 1].surface
						const hS = tile.array[x + 1]?.[z + 2]?.surface ?? tile.array[x + 1][z + 1].surface
						const hN = tile.array[x + 1]?.[z]?.surface ?? tile.array[x + 1][z + 1].surface
						// tile.step is in quart units; convert to block scale for cubiomes lighting.
						const hillshadeScale = tile.step * 4

						// Y 軸已被翻轉 (min.y *= -1)，所以 array 中 z 方向與視覺 N/S 相反
						// 交換 hN 和 hS 以對齊視覺方向，使用 cubiomes 的原始公式
						hillshade = calculateHillshadeSimple(hS, hN, hE, hW, hillshadeScale, false)
					}

					// 套用 hillshade 到顏色
					biomeColor = {
						r: Math.round(biomeColor.r * hillshade),
						g: Math.round(biomeColor.g * hillshade),
						b: Math.round(biomeColor.b * hillshade)
					}
				}

				smallCtx.fillStyle = `rgb(${biomeColor.r}, ${biomeColor.g}, ${biomeColor.b})`
				smallCtx.fillRect(x, z, 1, 1)
			}
		}

		// 用平滑縮放繪製到主 canvas（抗鋸齒效果）
		tile.ctx.imageSmoothingEnabled = true
		tile.ctx.imageSmoothingQuality = 'high'
		tile.ctx.drawImage(smallCanvas, 0, 0, gridSize, gridSize, 0, 0, this.tileSize, this.tileSize)

		// === 第三階段：海平面波浪效果 ===
		if (show_sealevel && project_down) {
			for (let x = 0; x < gridSize; x++) {
				for (let z = 0; z < gridSize; z++) {
					const y = Math.min(tile.array[x + 1][z + 1].surface, this.y.value)
					const belowSurface = y < tile.array[x + 1][z + 1].surface
					if (!belowSurface && y < this.loadedDimensionStore.noise_generator_settings.seaLevel - 2) {
						tile.ctx.drawImage(waveImage, (x * pixelSize) % 16, (z * pixelSize) % 16, 4, 4, x * pixelSize, z * pixelSize, 4, 4)
					}
				}
			}
		}

		// === 第四階段：等高線渲染 ===
		if (contourInterval > 0 && project_down) {
			tile.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
			tile.ctx.lineWidth = 1

			for (let x = 0; x < gridSize; x++) {
				for (let z = 0; z < gridSize; z++) {
					const h1 = tile.array[x + 1][z + 1].surface
					const h2 = tile.array[x + 2][z + 1].surface  // 右邊
					const h3 = tile.array[x + 1][z + 2].surface  // 下方

					const level1 = Math.floor(h1 / contourInterval)
					const level2 = Math.floor(h2 / contourInterval)
					const level3 = Math.floor(h3 / contourInterval)

					const px = x * pixelSize
					const pz = z * pixelSize

					// 繪製垂直邊界（與右邊像素比較）
					if (level1 !== level2) {
						tile.ctx.beginPath()
						tile.ctx.moveTo(px + pixelSize, pz)
						tile.ctx.lineTo(px + pixelSize, pz + pixelSize)
						tile.ctx.stroke()
					}

					// 繪製水平邊界（與下方像素比較）
					if (level1 !== level3) {
						tile.ctx.beginPath()
						tile.ctx.moveTo(px, pz + pixelSize)
						tile.ctx.lineTo(px + pixelSize, pz + pixelSize)
						tile.ctx.stroke()
					}
				}
			}
		}

	}

	async rerender() {
		console.log("rerendering")
		for (const key in this.Tiles) {
			if (!this.Tiles[key].isRendering) {
				this.Tiles[key].isRendering = true
				setTimeout(() => this.renderTile(this.Tiles[key]), 0)
			}
		}
	}


	// ==== Manage workers to generate biomes of tiles
	private createWorkers() {
		this.workers = []
		for (let i = 0; i < WORKER_COUNT; i++) {
			const worker = new MultiNoiseCalculator()
			worker.onmessage = (ev) => {
				if (ev.data.generationVersion < this.generationVersion) {
					return
				}
				const tile = this.Tiles[ev.data.key]
				if (tile === undefined)
					return

				tile.array = ev.data.array
				tile.step = ev.data.step

				tile.isRendering = true
				this.renderTile(tile)

				tile.done()
				tile.done = () => { /* nothing */ }
			}

			this.workers.push(worker)
		}
	}

	async updateWorkers(do_update: {
		registires?: boolean,
		dimension?: boolean,
		settings?: boolean,
	}) {
		this.generationVersion++
		const update: any = { generationVersion: this.generationVersion }

		if (do_update.registires) {
			update.densityFunctions = {}
			for (const id of await this.datapackStore.composite_datapack.getIds(ResourceLocation.WORLDGEN_DENSITY_FUNCTION)) {
				update.densityFunctions[id.toString()] = await this.datapackStore.composite_datapack.get(ResourceLocation.WORLDGEN_DENSITY_FUNCTION, id)
			}

			update.noises = {}
			for (const id of await this.datapackStore.composite_datapack.getIds(ResourceLocation.WORLDGEN_NOISE)) {
				update.noises[id.toString()] = await this.datapackStore.composite_datapack.get(ResourceLocation.WORLDGEN_NOISE, id)
			}
		}

		if (do_update.dimension) {
			update.biomeSourceJson = toRaw(this.loadedDimensionStore.loaded_dimension.biome_source_json)
			update.noiseGeneratorSettingsJson = toRaw(this.loadedDimensionStore.loaded_dimension.noise_settings_json)
			update.surfaceDensityFunctionId = getCustomDensityFunction("snowcapped_surface", this.loadedDimensionStore.loaded_dimension.noise_settings_id!, this.settingsStore.dimension)?.toString() ?? "<none>"
			update.terrainDensityFunctionId = getCustomDensityFunction("map_simple_terrain", this.loadedDimensionStore.loaded_dimension.noise_settings_id!, this.settingsStore.dimension)?.toString() ?? "<none>"
		}

		if (do_update.settings) {
			update.seed = this.settingsStore.seed
			update.y = this.y.value
			update.project_down = this.project_down.value
		}

		this.workers.forEach(w => w.postMessage({ update }))
	}

	generateTile(key: string, coords: L.Coords, worker_id: number) {
		// @ts-expect-error: _tileCoordsToBounds does not exist
		const tileBounds = this._tileCoordsToBounds(coords);
		const west = tileBounds.getWest(),
			east = tileBounds.getEast(),
			north = tileBounds.getNorth(),
			south = tileBounds.getSouth();

		const crs = this._map.options.crs!,
			min = crs.project(L.latLng(north, west)).multiplyBy(0.25),
			max = crs.project(L.latLng(south, east)).multiplyBy(0.25);

		min.y *= -1
		max.y *= -1

		const task = {
			key,
			min,
			max,
			tileSize: this.tileSize * this.calcResolution
		}

		this.workers[worker_id].postMessage({ task })
	}

	createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
		const tile = L.DomUtil.create("canvas", "leaflet-tile")
		tile.width = tile.height = this.tileSize

		tile.onselectstart = tile.onmousemove = L.Util.falseFn

		const ctx = tile.getContext("2d")!

		if (!this._map) {
			return tile;
		}

		this.datapackLoader?.then(() => {
			const key = this._tileCoordsToKey(coords)
			this.Tiles[key] = { coords: coords, canvas: tile, ctx: ctx, done: done, workerId: this.next_worker_id }

			this.generateTile(key, coords, this.next_worker_id)
			this.next_worker_id = (this.next_worker_id + 1) % WORKER_COUNT
		})

		return tile
	}

	_removeTile(key: string) {
		if (this.Tiles[key] === undefined)
			return

		this.workers[this.Tiles[key].workerId].postMessage({ cancel: key })

		delete this.Tiles[key]

		// @ts-expect-error: _removeTile does not exist
		L.TileLayer.prototype._removeTile.call(this, key)
	}

}
