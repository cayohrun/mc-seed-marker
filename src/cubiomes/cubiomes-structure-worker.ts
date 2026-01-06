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
  }
}

// Expose via Comlink
Comlink.expose(structureQuery)
