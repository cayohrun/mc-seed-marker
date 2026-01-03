import * as L from "leaflet"
import CubiomesWorker from "../webworker/CubiomesWorker?worker"
import { useSettingsStore } from "../stores/useSettingsStore.js"
import { Ref, watch } from "vue"

const WORKER_COUNT = 4

// Extract major.minor version from datapack version string
function getMcVersion(versionString: string): string {
	// Handle strings like "1.21.4", "1.20.6", etc.
	const match = versionString.match(/^(\d+\.\d+)/)
	return match ? match[1] : '1.21'
}

type Tile = {
	coords: L.Coords,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	done: L.DoneCallback,
	imageData?: Uint8ClampedArray,
	width?: number,
	height?: number,
	workerId: number
}

/**
 * BiomeLayer using cubiomes WASM for rendering
 * This provides pixel-perfect rendering matching mcseedmap.net
 */
export class CubiomesBiomeLayer extends L.GridLayer {
	private next_worker_id = 0
	private Tiles: { [key: string]: Tile } = {}
	private tileSize = 0
	private workers: Worker[] = []
	private settingsStore = useSettingsStore()
	private generationVersion = 0

	constructor(
		options: L.GridLayerOptions,
		private do_hillshade: Ref<boolean>,
		private y: Ref<number>
	) {
		super(options)
		this.tileSize = options.tileSize as number

		this.createWorkers()
		this.updateWorkers()

		// Watch for hillshade toggle
		watch(do_hillshade, () => {
			this.updateWorkers()
			this.redraw()
		})

		// Watch for Y level changes
		watch(y, () => {
			this.updateWorkers()
			this.redraw()
		})

		// Watch for seed changes
		watch(() => this.settingsStore.seed, () => {
			this.updateWorkers()
			this.redraw()
		})

		// Watch for version changes
		watch(() => this.settingsStore.mc_version, () => {
			this.updateWorkers()
			this.redraw()
		})
	}

	private createWorkers() {
		this.workers = []
		for (let i = 0; i < WORKER_COUNT; i++) {
			const worker = new CubiomesWorker()
			worker.onmessage = (ev) => {
				if (ev.data.generationVersion < this.generationVersion) {
					return
				}

				const tile = this.Tiles[ev.data.key]
				if (!tile) return

				tile.imageData = ev.data.imageData
				tile.width = ev.data.width
				tile.height = ev.data.height

				this.renderTile(tile)
				tile.done()
				tile.done = () => { /* nothing */ }
			}
			this.workers.push(worker)
		}
	}

	private updateWorkers() {
		this.generationVersion++

		const mcVersion = getMcVersion(this.settingsStore.mc_version)
		const shaderKind = this.do_hillshade.value ? 1 : 0  // 1 = Simple hillshade

		// Convert BigInt to string for postMessage (BigInt can't be serialized)
		const update = {
			seed: this.settingsStore.seed.toString(),
			y: this.y.value,
			mcVersion,
			shaderKind,
			generationVersion: this.generationVersion
		}

		this.workers.forEach(w => w.postMessage({ update }))
	}

	private renderTile(tile: Tile) {
		if (!tile.imageData || !tile.width || !tile.height) {
			console.warn('[CubiomesBiomeLayer] No image data to render')
			return
		}

		// Create ImageData from RGBA buffer
		const imgData = new ImageData(new Uint8ClampedArray(tile.imageData), tile.width, tile.height)

		// Draw to canvas
		tile.ctx.clearRect(0, 0, this.tileSize, this.tileSize)

		// Create offscreen canvas for the WASM output
		const offscreen = document.createElement('canvas')
		offscreen.width = tile.width
		offscreen.height = tile.height
		const offCtx = offscreen.getContext('2d')!
		offCtx.putImageData(imgData, 0, 0)

		// Scale to tile size with smoothing
		tile.ctx.imageSmoothingEnabled = true
		tile.ctx.imageSmoothingQuality = 'high'
		tile.ctx.drawImage(offscreen, 0, 0, tile.width, tile.height, 0, 0, this.tileSize, this.tileSize)
	}

	private generateTile(key: string, coords: L.Coords, worker_id: number) {
		// @ts-expect-error: _tileCoordsToBounds does not exist
		const tileBounds = this._tileCoordsToBounds(coords)
		const west = tileBounds.getWest()
		const east = tileBounds.getEast()
		const north = tileBounds.getNorth()
		const south = tileBounds.getSouth()

		const crs = this._map.options.crs!
		const min = crs.project(L.latLng(north, west))
		const max = crs.project(L.latLng(south, east))

		// Convert to block coordinates
		const blockMin = { x: Math.floor(min.x), z: Math.floor(-min.y) }
		const blockMax = { x: Math.floor(max.x), z: Math.floor(-max.y) }

		// Calculate scale based on zoom level and tile size
		const blockWidth = blockMax.x - blockMin.x
		const renderSize = 64  // Render at 64x64 then scale up
		const scale = Math.max(1, Math.floor(blockWidth / renderSize))

		const task = {
			key,
			x: blockMin.x,
			z: blockMin.z,
			width: renderSize,
			height: renderSize,
			scale
		}

		this.workers[worker_id].postMessage({ task })
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
			workerId: this.next_worker_id
		}

		this.generateTile(key, coords, this.next_worker_id)
		this.next_worker_id = (this.next_worker_id + 1) % WORKER_COUNT

		return tile
	}

	_removeTile(key: string) {
		if (!this.Tiles[key]) return

		this.workers[this.Tiles[key].workerId].postMessage({ cancel: key })
		delete this.Tiles[key]

		// @ts-expect-error: _removeTile does not exist
		L.TileLayer.prototype._removeTile.call(this, key)
	}
}
