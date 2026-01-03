/**
 * cubiomes WASM wrapper with hillshade support
 * Based on cubiomes library and cubiomes-viewer hillshade algorithm
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// Include cubiomes headers
#include "cubiomes/biomes.h"
#include "cubiomes/generator.h"
#include "cubiomes/finders.h"
#include "cubiomes/util.h"

// Image buffer for output
static uint8_t *image_buffer = NULL;
static size_t image_buffer_size = 0;

// Height buffer for hillshade calculation
static int *height_buffer = NULL;

/**
 * Initialize the image buffer
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* init_buffer(size_t size) {
    if (image_buffer) {
        free(image_buffer);
    }
    image_buffer_size = size;
    image_buffer = (uint8_t*)malloc(size);
    return image_buffer;
}

/**
 * Get pointer to the image buffer
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* get_buffer() {
    return image_buffer;
}

/**
 * Apply hillshade to a single pixel
 * Based on cubiomes-viewer world.cpp applyHeightShading
 *
 * @param hN Height at North neighbor
 * @param hS Height at South neighbor
 * @param hE Height at East neighbor
 * @param hW Height at West neighbor
 * @param scale Scale factor
 * @return Light multiplier (0.5 to 1.5)
 */
static float calculate_hillshade(int hN, int hS, int hE, int hW, float scale) {
    // cubiomes-viewer formula:
    // d0 = t[0][1] + t[1][0]  // North + West
    // d1 = t[1][2] + t[2][1]  // East + South
    // light = 1.0 + (d1 - d0) * 0.25 / scale

    float d0 = (float)(hN + hW);
    float d1 = (float)(hE + hS);
    float mul = 0.25f / scale;
    float light = 1.0f + (d1 - d0) * mul;

    // Clamp to valid range
    if (light < 0.5f) light = 0.5f;
    if (light > 1.5f) light = 1.5f;

    return light;
}

/**
 * Generate biome image with hillshade
 *
 * @param seed_lo Lower 32 bits of seed
 * @param seed_hi Upper 32 bits of seed
 * @param x Top-left X coordinate (in blocks)
 * @param z Top-left Z coordinate (in blocks)
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param scale Blocks per pixel (1, 4, 16, 64, etc.)
 * @param mc_version Minecraft version enum
 * @param shader_kind 0=None, 1=Simple, 2=Stepped
 * @param y Y level for surface calculation
 * @return Size of generated image in bytes (width * height * 4 for RGBA)
 */
EMSCRIPTEN_KEEPALIVE
size_t generate_biome_image(
    uint32_t seed_lo, uint32_t seed_hi,
    int x, int z,
    int width, int height,
    int scale,
    int mc_version,
    int shader_kind,
    int y_level
) {
    // Reconstruct int64 seed from two 32-bit parts
    int64_t seed = ((int64_t)seed_hi << 32) | seed_lo;
    // Ensure buffer is allocated
    size_t img_size = width * height * 4; // RGBA
    if (!image_buffer || image_buffer_size < img_size) {
        init_buffer(img_size);
    }

    // Initialize biome colors
    unsigned char biomeColors[256][3];
    initBiomeColors(biomeColors);

    // Set up generator
    Generator g;
    setupGenerator(&g, mc_version, 0);
    applySeed(&g, DIM_OVERWORLD, seed);

    // Allocate biome and height arrays with padding for hillshade
    int padded_width = width + 2;
    int padded_height = height + 2;
    int *biomes = (int*)malloc(padded_width * padded_height * sizeof(int));
    int *heights = NULL;

    if (shader_kind > 0) {
        heights = (int*)malloc(padded_width * padded_height * sizeof(int));
    }

    // Generate biomes for the padded area
    int start_x = x - scale;
    int start_z = z - scale;

    for (int pz = 0; pz < padded_height; pz++) {
        for (int px = 0; px < padded_width; px++) {
            int world_x = start_x + px * scale;
            int world_z = start_z + pz * scale;
            int idx = pz * padded_width + px;

            biomes[idx] = getBiomeAt(&g, scale, world_x, y_level, world_z);

            if (heights) {
                // Get surface height for hillshade
                // For versions >= 1.18, use the actual surface finder
                if (mc_version >= MC_1_18) {
                    // Use estimateSurface for newer versions
                    heights[idx] = 64; // Default, will be replaced with actual surface calc

                    // Try to estimate surface height
                    int surface_y = 319;
                    for (int test_y = 319; test_y >= -64; test_y -= 4) {
                        int b = getBiomeAt(&g, 1, world_x, test_y, world_z);
                        // Check if this is a surface biome (not air/void)
                        if (b != -1) {
                            surface_y = test_y;
                            break;
                        }
                    }
                    heights[idx] = surface_y;
                } else {
                    // For older versions, use a simpler approach
                    heights[idx] = 64;
                }
            }
        }
    }

    // Generate the image
    for (int py = 0; py < height; py++) {
        for (int px = 0; px < width; px++) {
            int biome_idx = (py + 1) * padded_width + (px + 1);
            int biome = biomes[biome_idx];

            // Get base color
            uint8_t r = biomeColors[biome & 0xFF][0];
            uint8_t g_col = biomeColors[biome & 0xFF][1];
            uint8_t b = biomeColors[biome & 0xFF][2];

            // Apply hillshade if enabled
            if (shader_kind > 0 && heights) {
                int hN = heights[(py) * padded_width + (px + 1)];      // North
                int hS = heights[(py + 2) * padded_width + (px + 1)];  // South
                int hE = heights[(py + 1) * padded_width + (px + 2)];  // East
                int hW = heights[(py + 1) * padded_width + (px)];      // West

                float light = calculate_hillshade(hN, hS, hE, hW, (float)scale);

                // Apply stepped shading if shader_kind == 2
                if (shader_kind == 2) {
                    int h = heights[biome_idx];
                    if ((h / 16) % 2 == 0) {
                        light *= 0.95f;
                    }
                }

                r = (uint8_t)(r * light);
                g_col = (uint8_t)(g_col * light);
                b = (uint8_t)(b * light);
            }

            // Write RGBA pixel
            int pixel_idx = (py * width + px) * 4;
            image_buffer[pixel_idx + 0] = r;
            image_buffer[pixel_idx + 1] = g_col;
            image_buffer[pixel_idx + 2] = b;
            image_buffer[pixel_idx + 3] = 255; // Alpha
        }
    }

    // Cleanup
    free(biomes);
    if (heights) free(heights);

    return img_size;
}

/**
 * Get biome at a specific position
 */
EMSCRIPTEN_KEEPALIVE
int get_biome_at(uint32_t seed_lo, uint32_t seed_hi, int x, int y, int z, int scale, int mc_version) {
    int64_t seed = ((int64_t)seed_hi << 32) | seed_lo;
    Generator g;
    setupGenerator(&g, mc_version, 0);
    applySeed(&g, DIM_OVERWORLD, seed);
    return getBiomeAt(&g, scale, x, y, z);
}

/**
 * Get MC version constant from string
 */
EMSCRIPTEN_KEEPALIVE
int get_mc_version(const char* version_str) {
    return str2mc(version_str);
}
