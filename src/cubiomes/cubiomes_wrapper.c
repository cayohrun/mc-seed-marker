/**
 * Cubiomes WASM Wrapper
 * Provides a simplified interface for web usage via Emscripten
 */

#include <stdint.h>
#include <stdlib.h>
#include <emscripten.h>
#include "vendor/generator.h"
#include "vendor/biomes.h"
#include "vendor/biomenoise.h"
#include "vendor/finders.h"
#include "vendor/util.h"

// Global generator instance
static Generator g;
static SurfaceNoise g_sn;
static int initialized = 0;

/**
 * Convert our version string format (e.g., "1_21_4") to MCVersion enum
 */
static int parseVersion(int major, int minor, int patch) {
    if (major != 1) return MC_NEWEST;

    switch (minor) {
        case 18: return MC_1_18;
        case 19:
            if (patch >= 4) return MC_1_19_4;
            if (patch >= 2) return MC_1_19_2;
            return MC_1_19;
        case 20:
            if (patch >= 6) return MC_1_20_6;
            return MC_1_20;
        case 21:
            if (patch >= 3) return MC_1_21_WD;
            if (patch >= 1) return MC_1_21_3;
            return MC_1_21_1;
        default:
            return MC_NEWEST;
    }
}

/**
 * Initialize the generator for a specific MC version
 * @param versionMajor MC major version (always 1)
 * @param versionMinor MC minor version (18, 19, 20, 21)
 * @param versionPatch MC patch version
 * @param largeBiomes Whether to use large biomes world type
 */
EMSCRIPTEN_KEEPALIVE
void cubiomes_init(int versionMajor, int versionMinor, int versionPatch, int largeBiomes) {
    int mc = parseVersion(versionMajor, versionMinor, versionPatch);
    uint32_t flags = largeBiomes ? LARGE_BIOMES : 0;
    setupGenerator(&g, mc, flags);
    initialized = 1;
}

/**
 * Set the seed and dimension
 * @param seedLo Lower 32 bits of seed
 * @param seedHi Higher 32 bits of seed
 * @param dimension 0=Overworld, -1=Nether, 1=End
 */
EMSCRIPTEN_KEEPALIVE
void cubiomes_set_seed(uint32_t seedLo, uint32_t seedHi, int dimension) {
    if (!initialized) return;
    uint64_t seed = ((uint64_t)seedHi << 32) | seedLo;
    applySeed(&g, dimension, seed);
    initSurfaceNoise(&g_sn, dimension, seed);
}

/**
 * Generate biome IDs for a 2D area
 * @param blockX Starting X coordinate (in blocks)
 * @param blockZ Starting Z coordinate (in blocks)
 * @param width Width of the area
 * @param height Height of the area
 * @param scale Scale factor (1 = block, 4 = biome coords)
 * @param yLevel Y level for 3D biomes (MC 1.18+)
 * @param outPtr Output buffer (must be pre-allocated with width*height ints)
 * @return 0 on success
 */
EMSCRIPTEN_KEEPALIVE
int cubiomes_gen_biomes(int blockX, int blockZ, int width, int height, int scale, int yLevel, int* outPtr) {
    if (!initialized || !outPtr) return -1;

    Range r;
    r.scale = scale;
    r.x = blockX / scale;
    r.z = blockZ / scale;
    r.sx = width;
    r.sz = height;
    r.y = yLevel;
    r.sy = 0; // 2D generation

    return genBiomes(&g, outPtr, r);
}

/**
 * Generate approximate surface heightmap (1:4 scale)
 * @param quartX Starting X coordinate in quart units (block / 4)
 * @param quartZ Starting Z coordinate in quart units (block / 4)
 * @param width Width of the area (in quart units)
 * @param height Height of the area (in quart units)
 * @param outPtr Output buffer (float array, width*height)
 * @return 0 on success
 */
EMSCRIPTEN_KEEPALIVE
int cubiomes_gen_heightmap(int quartX, int quartZ, int width, int height, float* outPtr) {
    if (!initialized || !outPtr) return -1;
    return mapApproxHeight(outPtr, NULL, &g, &g_sn, quartX, quartZ, width, height);
}

/**
 * Get biome name for a given biome ID (no namespace)
 */
EMSCRIPTEN_KEEPALIVE
const char* cubiomes_biome_to_str(int biomeId) {
    if (!initialized) return "";
    return biome2str(g.mc, biomeId);
}

/**
 * Get a single biome at a specific position
 * @param blockX X coordinate (in blocks)
 * @param blockZ Z coordinate (in blocks)
 * @param yLevel Y level
 * @return Biome ID or -1 on failure
 */
EMSCRIPTEN_KEEPALIVE
int cubiomes_get_biome_at(int blockX, int blockZ, int yLevel) {
    if (!initialized) return -1;
    return getBiomeAt(&g, 1, blockX, yLevel, blockZ);
}

/**
 * Allocate memory for biome generation
 * @param size Number of ints to allocate
 * @return Pointer to allocated memory
 */
EMSCRIPTEN_KEEPALIVE
int* cubiomes_alloc(int size) {
    return (int*)malloc(size * sizeof(int));
}

/**
 * Free allocated memory
 * @param ptr Pointer to free
 */
EMSCRIPTEN_KEEPALIVE
void cubiomes_free(int* ptr) {
    if (ptr) free(ptr);
}

/**
 * Get the current MC version enum value (for debugging)
 */
EMSCRIPTEN_KEEPALIVE
int cubiomes_get_mc_version() {
    return g.mc;
}

/**
 * Get Bastion variant type
 * @param blockX Block X coordinate
 * @param blockZ Block Z coordinate
 * @return 0..3 for variant type, -1 on failure
 */
EMSCRIPTEN_KEEPALIVE
int cubiomes_get_bastion_type(int blockX, int blockZ) {
    if (!initialized) return -1;
    StructureVariant sv;
    int result = getVariant(&sv, Bastion, g.mc, g.seed, blockX, blockZ, -1);
    if (result == 0) return -1;
    return sv.start;  // 0..3
}

/**
 * Check if End City has a ship
 * @param chunkX Chunk X coordinate (blockX >> 4)
 * @param chunkZ Chunk Z coordinate (blockZ >> 4)
 * @return 1 if has ship, 0 if no ship, -1 on failure
 */
EMSCRIPTEN_KEEPALIVE
int cubiomes_end_city_has_ship(int chunkX, int chunkZ) {
    if (!initialized) return -1;
    Piece pieces[END_CITY_PIECES_MAX];
    int count = getEndCityPieces(pieces, g.seed, chunkX, chunkZ);
    if (count <= 0) return -1;
    for (int i = 0; i < count; i++) {
        if (pieces[i].type == END_SHIP) return 1;
    }
    return 0;
}
