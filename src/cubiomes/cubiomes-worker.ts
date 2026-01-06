/**
 * Cubiomes Web Worker
 * Provides biome generation using Cubiomes WASM
 */

import * as Comlink from 'comlink'
import type { CubiomesModule } from './cubiomes.d.ts'
import { getMcseedmapBiomeColor } from '../config/biomeColors.js'

// Will be set after WASM module loads
let Module: CubiomesModule | null = null
let initialized = false

// Cached function pointers
let cubiomes_init: (major: number, minor: number, patch: number, largeBiomes: number) => void
let cubiomes_set_seed: (seedLo: number, seedHi: number, dimension: number) => void
let cubiomes_gen_biomes: (blockX: number, blockZ: number, width: number, height: number, scale: number, yLevel: number, outPtr: number) => number
let cubiomes_gen_heightmap: (quartX: number, quartZ: number, width: number, height: number, outPtr: number) => number
let cubiomes_biome_to_str: (biomeId: number) => string | null
let cubiomes_alloc: (size: number) => number
let cubiomes_free: (ptr: number) => void

// Current configuration
let currentSeed: bigint = 0n
let currentDimension: number = 0
let currentVersionMinor: number = 0

const DEFAULT_COLOR = { r: 128, g: 128, b: 128 }
const MAX_BIOME_ID = 255

let biomeColorLut: Uint8Array | null = null

function rebuildBiomeColorLut(): void {
  if (!cubiomes_biome_to_str) return

  const lut = new Uint8Array((MAX_BIOME_ID + 1) * 3)
  for (let biomeId = 0; biomeId <= MAX_BIOME_ID; biomeId++) {
    const biomeName = cubiomes_biome_to_str(biomeId)
    const biomeKey = biomeName ? `minecraft:${biomeName}` : ''
    const color = biomeKey ? getMcseedmapBiomeColor(biomeKey) : undefined
    const r = color?.r ?? DEFAULT_COLOR.r
    const g = color?.g ?? DEFAULT_COLOR.g
    const b = color?.b ?? DEFAULT_COLOR.b
    const offset = biomeId * 3
    lut[offset] = r
    lut[offset + 1] = g
    lut[offset + 2] = b
  }
  biomeColorLut = lut
}

/**
 * Split 64-bit BigInt seed into two 32-bit numbers
 */
function splitSeed(seed: bigint): [number, number] {
  const lo = Number(seed & 0xFFFFFFFFn)
  const hi = Number((seed >> 32n) & 0xFFFFFFFFn)
  return [lo, hi]
}

function readBiomeColor(biomeId: number): { r: number; g: number; b: number } {
  if (!biomeColorLut || biomeId < 0 || biomeId > MAX_BIOME_ID) {
    return DEFAULT_COLOR
  }
  const offset = biomeId * 3
  return {
    r: biomeColorLut[offset] ?? DEFAULT_COLOR.r,
    g: biomeColorLut[offset + 1] ?? DEFAULT_COLOR.g,
    b: biomeColorLut[offset + 2] ?? DEFAULT_COLOR.b
  }
}

function calculateHillshadeSimple(hN: number, hS: number, hE: number, hW: number, scale: number): number {
  const d0 = hN + hW
  const d1 = hS + hE
  const mul = 0.25 / Math.max(0.0001, scale)
  let light = 1.0 + (d1 - d0) * mul

  if (light < 0.5) light = 0.5
  if (light > 1.5) light = 1.5

  return light
}

function bilinearInterpolate(
  heightData: Float32Array,
  gridWidth: number,
  x: number,
  z: number
): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const x1 = x0 + 1
  const z1 = z0 + 1
  const fx = x - x0
  const fz = z - z0

  const idx00 = (z0 + 1) * gridWidth + (x0 + 1)
  const idx10 = (z0 + 1) * gridWidth + (x1 + 1)
  const idx01 = (z1 + 1) * gridWidth + (x0 + 1)
  const idx11 = (z1 + 1) * gridWidth + (x1 + 1)

  const v00 = heightData[idx00] ?? 0
  const v10 = heightData[idx10] ?? v00
  const v01 = heightData[idx01] ?? v00
  const v11 = heightData[idx11] ?? v00

  return v00 * (1 - fx) * (1 - fz)
    + v10 * fx * (1 - fz)
    + v01 * (1 - fx) * fz
    + v11 * fx * fz
}

function calculateSmoothHillshade(
  px: number,
  pz: number,
  heightData: Float32Array,
  gridWidth: number,
  scale: number,
  step: number,
  heightFactor: number
): number {
  const gx = px / scale
  const gz = pz / scale

  const hE = bilinearInterpolate(heightData, gridWidth, gx + 0.5 / scale, gz) * heightFactor
  const hW = bilinearInterpolate(heightData, gridWidth, gx - 0.5 / scale, gz) * heightFactor
  const hS = bilinearInterpolate(heightData, gridWidth, gx, gz + 0.5 / scale) * heightFactor
  const hN = bilinearInterpolate(heightData, gridWidth, gx, gz - 0.5 / scale) * heightFactor

  const slopeX = hE - hW
  const slopeZ = hS - hN

  return calculateHillshadeSimple(0, slopeZ, slopeX, 0, step / scale)
}

/**
 * Cubiomes Generator interface (compatible with existing McseedmapBiomeLayer)
 */
const generator = {
  /**
   * Initialize WASM module
   */
  async initialize(wasmPath: string = '/wasm/cubiomes.wasm'): Promise<void> {
    if (Module) return

    // Dynamic import of the ES module
    const CubiomesModuleFactory = (await import('./cubiomes.js')).default
    Module = await CubiomesModuleFactory({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return wasmPath
        }
        return path
      }
    }) as CubiomesModule

    // Get function pointers (type assertions needed for cwrap)
    cubiomes_init = Module.cwrap('cubiomes_init', null, ['number', 'number', 'number', 'number']) as typeof cubiomes_init
    cubiomes_set_seed = Module.cwrap('cubiomes_set_seed', null, ['number', 'number', 'number']) as typeof cubiomes_set_seed
    cubiomes_gen_biomes = Module.cwrap('cubiomes_gen_biomes', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']) as typeof cubiomes_gen_biomes
    cubiomes_gen_heightmap = Module.cwrap('cubiomes_gen_heightmap', 'number', ['number', 'number', 'number', 'number', 'number']) as typeof cubiomes_gen_heightmap
    cubiomes_biome_to_str = Module.cwrap('cubiomes_biome_to_str', 'string', ['number']) as typeof cubiomes_biome_to_str
    cubiomes_alloc = Module.cwrap('cubiomes_alloc', 'number', ['number']) as typeof cubiomes_alloc
    cubiomes_free = Module.cwrap('cubiomes_free', null, ['number']) as typeof cubiomes_free

    initialized = true
    console.log('[Cubiomes] WASM initialized')
  },

  /**
   * Configure generator (compatible with mcseedmap interface)
   */
  configure(
    seed: bigint,
    tileSize: number,
    library: number,
    versionMajor: number,
    versionMinor: number,
    versionPatch: number,
    dimension: number,
    largeBiomes: boolean
  ): void {
    if (!initialized) return

    cubiomes_init(versionMajor, versionMinor, versionPatch, largeBiomes ? 1 : 0)
    rebuildBiomeColorLut()

    const [seedLo, seedHi] = splitSeed(seed)
    cubiomes_set_seed(seedLo, seedHi, dimension)

    currentSeed = seed
    currentDimension = dimension
    currentVersionMinor = versionMinor
  },

  /**
   * Not needed for Cubiomes
   */
  setColors(colors: number[]): void {
    // No-op: colors are handled in JS
  },

  /**
   * Not needed for Cubiomes
   */
  setBiomeTree(data: Uint8Array, url: string): void {
    // No-op: Cubiomes doesn't use btree
  },

  /**
   * Not needed for Cubiomes
   */
  getBiomeTreeUrl(): string | undefined {
    return undefined
  },

  /**
   * Generate biome image (BMP format, compatible with mcseedmap)
   */
  async generateBiomeImage(
    zoomOffset: number,
    blockX: number,
    blockZ: number,
    yLevel: number,
    shaderKind: number,
    contourKind: number,
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
  ): Promise<ArrayBuffer> {
    if (!initialized || !Module) {
      throw new Error('Cubiomes not initialized')
    }
    if (!biomeColorLut) {
      rebuildBiomeColorLut()
    }

    const tileSize = 256
    const tileBlockSize = zoomOffset < 0
      ? (tileSize << -zoomOffset)
      : (tileSize >> zoomOffset)
    const blocksPerPixel = tileBlockSize / tileSize

    let genScale = 1
    let downsample = 1
    let upsample = 1

    if (blocksPerPixel >= 1) {
      while (genScale * 4 <= blocksPerPixel && genScale < 256) {
        genScale *= 4
      }
      downsample = Math.max(1, Math.round(blocksPerPixel / genScale))
    } else {
      upsample = Math.max(1, Math.round(1 / blocksPerPixel))
    }

    const genWidth = Math.max(1, Math.round(tileBlockSize / genScale))
    const genHeight = genWidth

    const bufferSize = genWidth * genHeight
    const biomePtr = cubiomes_alloc(bufferSize)
    let heightPtr: number | null = null
    let heightData: Float32Array | null = null
    let heightGridWidth = 0
    let heightGridHeight = 0
    let heightScale = 4
    let hillScale = 1
    let hillStep = blocksPerPixel

    try {
      // Generate biomes at appropriate scale
      const result = cubiomes_gen_biomes(
        blockX,
        blockZ,
        genWidth,
        genHeight,
        genScale,
        yLevel,
        biomePtr
      )

      if (result !== 0) {
        throw new Error(`Cubiomes generation failed: ${result}`)
      }

      const biomeIds = new Int32Array(Module.HEAP32.buffer, biomePtr, bufferSize)

      const useHillshade = shaderKind !== 0 && currentDimension !== -1
      const heightFactor = 1
      if (useHillshade) {
        const hasExternalHeightmap = heightmap
          && heightmapWidth
          && heightmapHeight
          && heightmapScale
          && heightmap.length >= heightmapWidth * heightmapHeight

        if (hasExternalHeightmap) {
          heightData = heightmap
          heightGridWidth = heightmapWidth
          heightGridHeight = heightmapHeight
          heightScale = heightmapScale
        } else {
          heightScale = 4
          heightGridWidth = Math.ceil(tileBlockSize / heightScale) + 2
          heightGridHeight = heightGridWidth
          heightPtr = cubiomes_alloc(heightGridWidth * heightGridHeight)
          const quartX = Math.floor(blockX / heightScale) - 1
          const quartZ = Math.floor(blockZ / heightScale) - 1
          cubiomes_gen_heightmap(
            quartX,
            quartZ,
            heightGridWidth,
            heightGridHeight,
            heightPtr
          )
          heightData = new Float32Array(Module.HEAPF32.buffer, heightPtr, heightGridWidth * heightGridHeight)
        }

        hillScale = heightScale / blocksPerPixel
        hillStep = blocksPerPixel
      }

      // Create BMP image (54 byte header + pixel data)
      // BMP is BGR format, bottom-up
      const bmpSize = 54 + tileSize * tileSize * 3
      const bmp = new Uint8Array(bmpSize)

      // BMP Header
      bmp[0] = 0x42 // 'B'
      bmp[1] = 0x4D // 'M'
      // File size (little endian)
      bmp[2] = bmpSize & 0xFF
      bmp[3] = (bmpSize >> 8) & 0xFF
      bmp[4] = (bmpSize >> 16) & 0xFF
      bmp[5] = (bmpSize >> 24) & 0xFF
      // Reserved
      bmp[6] = bmp[7] = bmp[8] = bmp[9] = 0
      // Pixel data offset
      bmp[10] = 54
      bmp[11] = bmp[12] = bmp[13] = 0
      // DIB header size
      bmp[14] = 40
      bmp[15] = bmp[16] = bmp[17] = 0
      // Width (little endian)
      bmp[18] = tileSize & 0xFF
      bmp[19] = (tileSize >> 8) & 0xFF
      bmp[20] = bmp[21] = 0
      // Height (little endian, positive = bottom-up)
      bmp[22] = tileSize & 0xFF
      bmp[23] = (tileSize >> 8) & 0xFF
      bmp[24] = bmp[25] = 0
      // Planes
      bmp[26] = 1
      bmp[27] = 0
      // Bits per pixel
      bmp[28] = 24
      bmp[29] = 0
      // Compression (none)
      bmp[30] = bmp[31] = bmp[32] = bmp[33] = 0
      // Image size (can be 0 for uncompressed)
      bmp[34] = bmp[35] = bmp[36] = bmp[37] = 0
      // Pixels per meter (unused)
      bmp[38] = bmp[39] = bmp[40] = bmp[41] = 0
      bmp[42] = bmp[43] = bmp[44] = bmp[45] = 0
      // Colors in palette (unused)
      bmp[46] = bmp[47] = bmp[48] = bmp[49] = 0
      // Important colors (unused)
      bmp[50] = bmp[51] = bmp[52] = bmp[53] = 0

      // Pixel data (BGR, bottom-up)
      let pixelOffset = 54
      for (let y = tileSize - 1; y >= 0; y--) {
        for (let x = 0; x < tileSize; x++) {
          const sampleX = blocksPerPixel >= 1
            ? Math.min(genWidth - 1, Math.floor(x * downsample))
            : Math.min(genWidth - 1, Math.floor(x / upsample))
          const sampleZ = blocksPerPixel >= 1
            ? Math.min(genHeight - 1, Math.floor(y * downsample))
            : Math.min(genHeight - 1, Math.floor(y / upsample))
          const biomeId = biomeIds[sampleZ * genWidth + sampleX]
          const baseColor = readBiomeColor(biomeId)
          const light = heightData
            ? calculateSmoothHillshade(x, y, heightData, heightGridWidth, hillScale, hillStep, heightFactor)
            : 1.0

          const r = Math.max(0, Math.min(255, Math.round(baseColor.r * light)))
          const g = Math.max(0, Math.min(255, Math.round(baseColor.g * light)))
          const b = Math.max(0, Math.min(255, Math.round(baseColor.b * light)))

          // BMP uses BGR order
          bmp[pixelOffset++] = b
          bmp[pixelOffset++] = g
          bmp[pixelOffset++] = r
        }
      }

      return bmp.buffer

    } finally {
      if (heightPtr !== null) {
        cubiomes_free(heightPtr)
      }
      cubiomes_free(biomePtr)
    }
  }
}

// Expose via Comlink
Comlink.expose(generator)
