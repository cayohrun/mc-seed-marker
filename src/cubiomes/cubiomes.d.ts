/**
 * TypeScript declarations for Cubiomes WASM module
 */

export interface CubiomesModule {
  // WASM memory views (exported via EXPORTED_RUNTIME_METHODS)
  HEAP8: Int8Array
  HEAP16: Int16Array
  HEAP32: Int32Array
  HEAPU8: Uint8Array
  HEAPU16: Uint16Array
  HEAPU32: Uint32Array
  HEAPF32: Float32Array
  HEAPF64: Float64Array

  // Emscripten utilities
  ccall: (
    ident: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ) => unknown

  cwrap: <T extends (...args: unknown[]) => unknown>(
    ident: string,
    returnType: string | null,
    argTypes: string[]
  ) => T

  // Exported functions (raw access)
  _cubiomes_init: (major: number, minor: number, patch: number, largeBiomes: number) => void
  _cubiomes_set_seed: (seedLo: number, seedHi: number, dimension: number) => void
  _cubiomes_gen_biomes: (blockX: number, blockZ: number, width: number, height: number, scale: number, yLevel: number, outPtr: number) => number
  _cubiomes_gen_heightmap: (quartX: number, quartZ: number, width: number, height: number, outPtr: number) => number
  _cubiomes_biome_to_str: (biomeId: number) => number
  _cubiomes_get_biome_at: (blockX: number, blockZ: number, yLevel: number) => number
  _cubiomes_get_bastion_type: (blockX: number, blockZ: number) => number
  _cubiomes_end_city_has_ship: (chunkX: number, chunkZ: number) => number
  _cubiomes_igloo_has_basement: (blockX: number, blockZ: number, biomeID: number) => number
  _cubiomes_ruined_portal_is_giant: (blockX: number, blockZ: number, biomeID: number) => number
  _cubiomes_village_is_abandoned: (blockX: number, blockZ: number, biomeID: number) => number
  _cubiomes_alloc: (size: number) => number
  _cubiomes_free: (ptr: number) => void
  _cubiomes_get_mc_version: () => number
}

export interface CubiomesModuleFactory {
  (options?: {
    locateFile?: (path: string) => string
    print?: (text: string) => void
    printErr?: (text: string) => void
  }): Promise<CubiomesModule>
}

declare const CubiomesModule: CubiomesModuleFactory
export default CubiomesModule
