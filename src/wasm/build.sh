#!/bin/bash
# Build cubiomes WASM with hillshade support

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CUBIOMES_DIR="$PROJECT_ROOT/analysis/cubiomes"
BUILD_DIR="$SCRIPT_DIR/build"

mkdir -p "$BUILD_DIR"

# Copy cubiomes source files
mkdir -p "$BUILD_DIR/cubiomes"
cp "$CUBIOMES_DIR"/*.c "$BUILD_DIR/cubiomes/"
cp "$CUBIOMES_DIR"/*.h "$BUILD_DIR/cubiomes/"
cp -r "$CUBIOMES_DIR/tables" "$BUILD_DIR/cubiomes/"

# Copy main.c
cp "$SCRIPT_DIR/main.c" "$BUILD_DIR/"

echo "Building cubiomes WASM..."

cd "$BUILD_DIR"

# Use local emcc - generate ES module format
emcc \
    -O3 \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS='["_init_buffer", "_get_buffer", "_generate_biome_image", "_get_biome_at", "_get_mc_version", "_malloc", "_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["cwrap", "getValue", "setValue", "UTF8ToString", "HEAPU8", "wasmMemory"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME="CubiomesModule" \
    -s ENVIRONMENT='web,worker' \
    -s FILESYSTEM=0 \
    -s ASSERTIONS=0 \
    -I./cubiomes \
    -o cubiomes.mjs \
    main.c \
    cubiomes/biomes.c \
    cubiomes/biomenoise.c \
    cubiomes/finders.c \
    cubiomes/generator.c \
    cubiomes/layers.c \
    cubiomes/noise.c \
    cubiomes/util.c

# Copy output files to wasm directory
cp cubiomes.mjs "$SCRIPT_DIR/"
cp cubiomes.wasm "$SCRIPT_DIR/"

echo "Build complete!"
echo "Output files:"
echo "  - $SCRIPT_DIR/cubiomes.mjs"
echo "  - $SCRIPT_DIR/cubiomes.wasm"
