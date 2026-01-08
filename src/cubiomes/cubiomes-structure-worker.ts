/**
 * Cubiomes Structure Worker
 * Provides structure detail queries (Bastion type, End City ship) using Cubiomes WASM
 */

import * as Comlink from 'comlink'
import type { CubiomesModule } from './cubiomes.d.ts'

// Will be set after WASM module loads
let Module: CubiomesModule | null = null
let initialized = false

// Cached function pointers
let cubiomes_init: (major: number, minor: number, patch: number, largeBiomes: number) => void
let cubiomes_set_seed: (seedLo: number, seedHi: number, dimension: number) => void
let cubiomes_get_bastion_type: (blockX: number, blockZ: number) => number
let cubiomes_end_city_has_ship: (chunkX: number, chunkZ: number) => number
let cubiomes_igloo_has_basement: (blockX: number, blockZ: number, biomeID: number) => number
let cubiomes_ruined_portal_is_giant: (blockX: number, blockZ: number, biomeID: number) => number
let cubiomes_village_is_abandoned: (blockX: number, blockZ: number, biomeID: number) => number
let cubiomes_scan_end_gateways: (chunkX: number, chunkZ: number, width: number, height: number, outPtr: number, maxResults: number) => number
let cubiomes_alloc: (size: number) => number
let cubiomes_free: (ptr: number) => void

/**
 * Split 64-bit BigInt seed into two 32-bit numbers
 */
function splitSeed(seed: bigint): [number, number] {
  const lo = Number(seed & 0xFFFFFFFFn)
  const hi = Number((seed >> 32n) & 0xFFFFFFFFn)
  return [lo, hi]
}

/**
 * Cubiomes Structure Query interface
 */
const structureQuery = {
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

    // Get function pointers
    cubiomes_init = Module.cwrap('cubiomes_init', null, ['number', 'number', 'number', 'number']) as typeof cubiomes_init
    cubiomes_set_seed = Module.cwrap('cubiomes_set_seed', null, ['number', 'number', 'number']) as typeof cubiomes_set_seed
    cubiomes_get_bastion_type = Module.cwrap('cubiomes_get_bastion_type', 'number', ['number', 'number']) as typeof cubiomes_get_bastion_type
    cubiomes_end_city_has_ship = Module.cwrap('cubiomes_end_city_has_ship', 'number', ['number', 'number']) as typeof cubiomes_end_city_has_ship
    cubiomes_igloo_has_basement = Module.cwrap('cubiomes_igloo_has_basement', 'number', ['number', 'number', 'number']) as typeof cubiomes_igloo_has_basement
    cubiomes_ruined_portal_is_giant = Module.cwrap('cubiomes_ruined_portal_is_giant', 'number', ['number', 'number', 'number']) as typeof cubiomes_ruined_portal_is_giant
    cubiomes_village_is_abandoned = Module.cwrap('cubiomes_village_is_abandoned', 'number', ['number', 'number', 'number']) as typeof cubiomes_village_is_abandoned
    cubiomes_scan_end_gateways = Module.cwrap('cubiomes_scan_end_gateways', 'number', ['number', 'number', 'number', 'number', 'number', 'number']) as typeof cubiomes_scan_end_gateways
    cubiomes_alloc = Module.cwrap('cubiomes_alloc', 'number', ['number']) as typeof cubiomes_alloc
    cubiomes_free = Module.cwrap('cubiomes_free', null, ['number']) as typeof cubiomes_free

    initialized = true
    console.log('[CubiomesStructure] WASM initialized')
  },

  /**
   * Configure generator with seed, version, and dimension
   */
  configure(
    seedLo: number,
    seedHi: number,
    versionMajor: number,
    versionMinor: number,
    versionPatch: number,
    largeBiomes: boolean,
    dimension: number
  ): void {
    if (!initialized) return

    cubiomes_init(versionMajor, versionMinor, versionPatch, largeBiomes ? 1 : 0)
    cubiomes_set_seed(seedLo, seedHi, dimension)
  },

  /**
   * Get Bastion variant type
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @returns 0..3 for variant type, null on failure
   */
  getBastionType(blockX: number, blockZ: number): number | null {
    if (!initialized) return null
    const result = cubiomes_get_bastion_type(blockX, blockZ)
    return result === -1 ? null : result
  },

  /**
   * Check if End City has a ship
   * @param chunkX Chunk X coordinate (blockX >> 4)
   * @param chunkZ Chunk Z coordinate (blockZ >> 4)
   * @returns true if has ship, false if no ship, null on failure
   */
  endCityHasShip(chunkX: number, chunkZ: number): boolean | null {
    if (!initialized) return null
    const result = cubiomes_end_city_has_ship(chunkX, chunkZ)
    if (result === -1) return null
    return result === 1
  },

  /**
   * Check if Igloo has a basement
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @param biomeID Biome ID at the location
   * @returns true if has basement, false if not, null on failure
   */
  iglooHasBasement(blockX: number, blockZ: number, biomeID: number): boolean | null {
    if (!initialized) return null
    const result = cubiomes_igloo_has_basement(blockX, blockZ, biomeID)
    if (result === -1) return null
    return result === 1
  },

  /**
   * Check if Ruined Portal is giant
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @param biomeID Biome ID at the location
   * @returns true if giant, false if normal, null on failure
   */
  ruinedPortalIsGiant(blockX: number, blockZ: number, biomeID: number): boolean | null {
    if (!initialized) return null
    const result = cubiomes_ruined_portal_is_giant(blockX, blockZ, biomeID)
    if (result === -1) return null
    return result === 1
  },

  /**
   * Check if Village is abandoned (zombie village)
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @param biomeID Biome ID at the location
   * @returns true if abandoned, false if normal, null on failure
   */
  villageIsAbandoned(blockX: number, blockZ: number, biomeID: number): boolean | null {
    if (!initialized) return null
    const result = cubiomes_village_is_abandoned(blockX, blockZ, biomeID)
    if (result === -1) return null
    return result === 1
  },

  /**
   * Scan for End Gateways in a region
   * @param chunkX Starting chunk X coordinate
   * @param chunkZ Starting chunk Z coordinate
   * @param width Width in chunks
   * @param height Height in chunks
   * @param maxResults Maximum results (default 100)
   * @returns Array of {x, z} block coordinates, empty array on failure
   */
  scanEndGateways(chunkX: number, chunkZ: number, width: number, height: number, maxResults: number = 100): Array<{x: number, z: number}> {
    if (!initialized || !Module) return []

    // Allocate buffer for results (x, z pairs)
    const bufferSize = maxResults * 2
    const ptr = cubiomes_alloc(bufferSize)
    if (!ptr) return []

    try {
      const count = cubiomes_scan_end_gateways(chunkX, chunkZ, width, height, ptr, maxResults)
      if (count <= 0) return []

      // Read results from WASM memory
      const results: Array<{x: number, z: number}> = []
      for (let i = 0; i < count; i++) {
        const x = Module.HEAP32[(ptr >> 2) + i * 2]
        const z = Module.HEAP32[(ptr >> 2) + i * 2 + 1]
        results.push({ x, z })
      }
      return results
    } finally {
      cubiomes_free(ptr)
    }
  }
}

// Expose via Comlink
Comlink.expose(structureQuery)
