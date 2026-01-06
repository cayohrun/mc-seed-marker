#!/bin/bash
# Build Cubiomes WASM

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building Cubiomes WASM..."

# Cubiomes source files
CUBIOMES_SRC=(
    vendor/biomes.c
    vendor/biomenoise.c
    vendor/generator.c
    vendor/layers.c
    vendor/noise.c
    vendor/util.c
    vendor/finders.c
    vendor/quadbase.c
)

# Wrapper
WRAPPER_SRC="cubiomes_wrapper.c"

# Output
OUTPUT="cubiomes.js"

# Emscripten flags
EMCC_FLAGS=(
    -O3
    -s WASM=1
    -s WASM_BIGINT=1
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAP8","HEAP16","HEAP32","HEAPU8","HEAPU16","HEAPU32","HEAPF32","HEAPF64"]'
    -s ALLOW_MEMORY_GROWTH=1
    -s MODULARIZE=1
    -s EXPORT_ES6=1
    -s EXPORT_NAME="CubiomesModule"
    -s ENVIRONMENT='web,worker'
    -I vendor
)

# Build
emcc "${EMCC_FLAGS[@]}" "${CUBIOMES_SRC[@]}" "$WRAPPER_SRC" -o "$OUTPUT"

echo "Build complete: $OUTPUT"
ls -la cubiomes.js cubiomes.wasm
