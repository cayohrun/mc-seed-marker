/**
 * Composable for Cubiomes structure queries
 * Provides Bastion type and End City ship detection
 */

import { ref, watch, onUnmounted } from 'vue'
import * as Comlink from 'comlink'
import { useSettingsStore } from '../stores/useSettingsStore.js'

// Dimension mapping (same as CubiomesBiomeLayer.ts)
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

// Split 64-bit BigInt seed into two 32-bit numbers
function splitSeed(seed: bigint): [number, number] {
  const lo = Number(seed & 0xFFFFFFFFn)
  const hi = Number((seed >> 32n) & 0xFFFFFFFFn)
  return [lo, hi]
}

// Worker interface
interface CubiomesStructureQuery {
  initialize(wasmPath: string): Promise<void>
  configure(
    seedLo: number,
    seedHi: number,
    versionMajor: number,
    versionMinor: number,
    versionPatch: number,
    largeBiomes: boolean,
    dimension: number
  ): Promise<void>
  getBastionType(blockX: number, blockZ: number): Promise<number | null>
  endCityHasShip(chunkX: number, chunkZ: number): Promise<boolean | null>
  iglooHasBasement(blockX: number, blockZ: number, biomeID: number): Promise<boolean | null>
  ruinedPortalIsGiant(blockX: number, blockZ: number, biomeID: number): Promise<boolean | null>
  villageIsAbandoned(blockX: number, blockZ: number, biomeID: number): Promise<boolean | null>
  scanEndGateways(chunkX: number, chunkZ: number, width: number, height: number, maxResults?: number): Promise<Array<{x: number, z: number}>>
}

// Cache for structure queries
interface CacheEntry<T> {
  value: T
  timestamp: number
}

const CACHE_TTL = 60000 // 1 minute

// Singleton worker instance
let workerInstance: Worker | null = null
let queryInstance: Comlink.Remote<CubiomesStructureQuery> | null = null
let initPromise: Promise<void> | null = null
let configurePromise: Promise<void> | null = null
let isInitialized = false

// Current configuration for cache invalidation
let currentConfigKey = ''

// Caches
const bastionTypeCache = new Map<string, CacheEntry<number | null>>()
const endCityShipCache = new Map<string, CacheEntry<boolean | null>>()
const iglooBasementCache = new Map<string, CacheEntry<boolean | null>>()
const ruinedPortalGiantCache = new Map<string, CacheEntry<boolean | null>>()
const villageAbandonedCache = new Map<string, CacheEntry<boolean | null>>()

/**
 * Initialize the worker (singleton)
 */
async function initWorker(): Promise<Comlink.Remote<CubiomesStructureQuery>> {
  if (queryInstance && isInitialized) {
    return queryInstance
  }

  if (initPromise) {
    await initPromise
    return queryInstance!
  }

  initPromise = (async () => {
    try {
      const workerUrl = new URL('./cubiomes-structure-worker.ts', import.meta.url)
      workerInstance = new Worker(workerUrl, { type: 'module' })
      queryInstance = Comlink.wrap<CubiomesStructureQuery>(workerInstance)
      await queryInstance.initialize('/wasm/cubiomes.wasm')
      isInitialized = true
      console.log('[useCubiomesStructure] Worker initialized')
    } catch (error) {
      console.error('[useCubiomesStructure] Failed to initialize:', error)
      throw error
    }
  })()

  await initPromise
  return queryInstance!
}

/**
 * Configure the worker with current settings
 */
async function configureWorker(settingsStore: ReturnType<typeof useSettingsStore>) {
  if (configurePromise) {
    await configurePromise
  }

  const [seedLo, seedHi] = splitSeed(settingsStore.seed)
  const version = parseVersion(settingsStore.mc_version)
  const dimension = DIMENSION_MAP[settingsStore.dimension.toString()] ?? 0
  const largeBiomes = settingsStore.world_preset.toString() === 'minecraft:large_biomes'

  // Update config key for cache invalidation
  const newConfigKey = `${settingsStore.seed}_${settingsStore.mc_version}_${settingsStore.dimension}_${largeBiomes}`
  if (newConfigKey === currentConfigKey) return

  const query = await initWorker()
  configurePromise = (async () => {
    await query.configure(
      seedLo,
      seedHi,
      version.major,
      version.minor,
      version.patch,
      largeBiomes,
      dimension
    )

    currentConfigKey = newConfigKey
    bastionTypeCache.clear()
    endCityShipCache.clear()
    iglooBasementCache.clear()
    ruinedPortalGiantCache.clear()
    villageAbandonedCache.clear()
  })()

  try {
    await configurePromise
  } finally {
    configurePromise = null
  }
}

/**
 * Composable for Cubiomes structure queries
 */
export function useCubiomesStructure() {
  const settingsStore = useSettingsStore()
  const ready = ref(false)

  // Initialize and configure on mount
  initWorker()
    .then(() => configureWorker(settingsStore))
    .then(() => { ready.value = true })
    .catch(err => console.error('[useCubiomesStructure] Init error:', err))

  // Watch for settings changes
  const stopWatch = watch(
    () => [settingsStore.seed, settingsStore.mc_version, settingsStore.dimension, settingsStore.world_preset],
    () => {
      if (isInitialized) {
        configureWorker(settingsStore).catch(err =>
          console.error('[useCubiomesStructure] Configure error:', err)
        )
      }
    }
  )

  // Cleanup on unmount
  onUnmounted(() => {
    stopWatch()
  })

  /**
   * Get Bastion variant type
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @returns 0..3 for variant type, null on failure/unknown
   */
  async function getBastionType(blockX: number, blockZ: number): Promise<number | null> {
    await configureWorker(settingsStore)

    const cacheKey = `${currentConfigKey}_${blockX}_${blockZ}`
    const cached = bastionTypeCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value
    }

    try {
      const result = await queryInstance!.getBastionType(blockX, blockZ)
      bastionTypeCache.set(cacheKey, { value: result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error('[useCubiomesStructure] getBastionType error:', error)
      return null
    }
  }

  /**
   * Check if End City has a ship
   * @param chunkX Chunk X coordinate (blockX >> 4)
   * @param chunkZ Chunk Z coordinate (blockZ >> 4)
   * @returns true if has ship, false if no ship, null on failure/unknown
   */
  async function endCityHasShip(chunkX: number, chunkZ: number): Promise<boolean | null> {
    await configureWorker(settingsStore)

    const cacheKey = `${currentConfigKey}_${chunkX}_${chunkZ}`
    const cached = endCityShipCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value
    }

    try {
      const result = await queryInstance!.endCityHasShip(chunkX, chunkZ)
      endCityShipCache.set(cacheKey, { value: result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error('[useCubiomesStructure] endCityHasShip error:', error)
      return null
    }
  }

  /**
   * Check if Igloo has a basement
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @param biomeID Biome ID at the location
   * @returns true if has basement, false if not, null on failure/unknown
   */
  async function iglooHasBasement(blockX: number, blockZ: number, biomeID: number): Promise<boolean | null> {
    await configureWorker(settingsStore)

    const cacheKey = `${currentConfigKey}_${blockX}_${blockZ}_${biomeID}`
    const cached = iglooBasementCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value
    }

    try {
      const result = await queryInstance!.iglooHasBasement(blockX, blockZ, biomeID)
      iglooBasementCache.set(cacheKey, { value: result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error('[useCubiomesStructure] iglooHasBasement error:', error)
      return null
    }
  }

  /**
   * Check if Ruined Portal is giant
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @param biomeID Biome ID at the location
   * @returns true if giant, false if normal, null on failure/unknown
   */
  async function ruinedPortalIsGiant(blockX: number, blockZ: number, biomeID: number): Promise<boolean | null> {
    await configureWorker(settingsStore)

    const cacheKey = `${currentConfigKey}_${blockX}_${blockZ}_${biomeID}`
    const cached = ruinedPortalGiantCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value
    }

    try {
      const result = await queryInstance!.ruinedPortalIsGiant(blockX, blockZ, biomeID)
      ruinedPortalGiantCache.set(cacheKey, { value: result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error('[useCubiomesStructure] ruinedPortalIsGiant error:', error)
      return null
    }
  }

  /**
   * Check if Village is abandoned (zombie village)
   * @param blockX Block X coordinate
   * @param blockZ Block Z coordinate
   * @param biomeID Biome ID at the location
   * @returns true if abandoned, false if normal, null on failure/unknown
   */
  async function villageIsAbandoned(blockX: number, blockZ: number, biomeID: number): Promise<boolean | null> {
    await configureWorker(settingsStore)

    const cacheKey = `${currentConfigKey}_${blockX}_${blockZ}_${biomeID}`
    const cached = villageAbandonedCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value
    }

    try {
      const result = await queryInstance!.villageIsAbandoned(blockX, blockZ, biomeID)
      villageAbandonedCache.set(cacheKey, { value: result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error('[useCubiomesStructure] villageIsAbandoned error:', error)
      return null
    }
  }

  /**
   * Scan for End Gateways in a region
   * @param chunkX Starting chunk X coordinate
   * @param chunkZ Starting chunk Z coordinate
   * @param width Width in chunks
   * @param height Height in chunks
   * @param maxResults Maximum results (default 100)
   * @returns Array of {x, z} block coordinates
   */
  async function scanEndGateways(
    chunkX: number,
    chunkZ: number,
    width: number,
    height: number,
    maxResults: number = 100
  ): Promise<Array<{x: number, z: number}>> {
    await configureWorker(settingsStore)

    try {
      const result = await queryInstance!.scanEndGateways(chunkX, chunkZ, width, height, maxResults)
      return result
    } catch (error) {
      console.error('[useCubiomesStructure] scanEndGateways error:', error)
      return []
    }
  }

  return {
    ready,
    getBastionType,
    endCityHasShip,
    iglooHasBasement,
    ruinedPortalIsGiant,
    villageIsAbandoned,
    scanEndGateways
  }
}
