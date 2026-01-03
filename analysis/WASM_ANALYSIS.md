# mcseedmap.net WASM 分析報告

## 概述

本報告記錄對 mcseedmap.net 的 WASM 和 JS bundle 的逆向工程分析結果。

---

## 1. 文件結構

| 文件 | 大小 | 說明 |
|------|------|------|
| `app-BhU6hj4I.js` | 1.17MB | 主 JS bundle（混淆） |
| `mcseedmap-CadMLpOM.wasm` | 174KB | WASM 模組 |
| `mcseedmap.wat` | 76,017 行 | WAT 反編譯 |
| `mcseedmap.dcmp` | 23,842 行 | C-like 反編譯 |

---

## 2. WASM 導出函數

WASM 導出被混淆為單字母：

| 導出名 | 原始函數 |
|--------|---------|
| `x` | func 151 |
| `y` | func 329 |
| `z` | func 22 |
| `A` | func 27 |

實際函數名在 WASM 字串段中找到：
- `SmGenerator` - 主生成器類
- `GenerateBiomeImage` - 生態系圖像生成
- `GetBiomeAt` - 單點生態系查詢
- `InitBiomeTree` - 初始化版本樹
- `SetBiomeColor` - 設置生態系顏色
- `SetSeed` - 設置種子

---

## 3. ShaderKind 枚舉

```javascript
var Ws = (e => (
  e[e.None = 0] = "None",
  e[e.Simple = 1] = "Simple",
  e[e.Stepped = 2] = "Stepped",
  e
))(Ws || {});
```

| 值 | 名稱 | 說明 |
|----|------|------|
| 0 | None | 無陰影 |
| 1 | Simple | 簡單 hillshade |
| 2 | Stepped | 階梯式 hillshade |

---

## 4. ContourKind 枚舉

```javascript
var Ua = (e => (
  e[e.None = 0] = "None",
  e[e.Simple = 1] = "Simple",
  e
))(Ua || {});
```

| 值 | 名稱 | 說明 |
|----|------|------|
| 0 | None | 無等高線 |
| 1 | Simple | 簡單等高線 |

---

## 5. generateBiomeImage 調用

```javascript
await f.generateBiomeImage(
  i,           // zoom level
  s,           // x coordinate
  l,           // z coordinate
  h.selectedY, // y level
  p.shaderKind,
  p.shaderKind != Ws.None ? p.contourKind : Ua.None,
  v,           // unknown
  p.useDesaturate,
  w            // unknown
)
```

---

## 6. 生態系顏色表（完整）

從 JS bundle 提取，格式：`cubiomesId:color:name`

```javascript
// Overworld
{ id: 0, color: 0x000070, name: "minecraft:ocean" },
{ id: 1, color: 0x8DB360, name: "minecraft:plains" },
{ id: 2, color: 0xFA9418, name: "minecraft:desert" },
{ id: 3, color: 0x606060, name: "minecraft:windswept_hills" },
{ id: 4, color: 0x056621, name: "minecraft:forest" },
{ id: 5, color: 0x0B6659, name: "minecraft:taiga" },
{ id: 6, color: 0x07F9B2, name: "minecraft:swamp" },
{ id: 7, color: 0x0000FF, name: "minecraft:river" },
{ id: 10, color: 0x7070D6, name: "minecraft:frozen_ocean" },
{ id: 11, color: 0xA0A0FF, name: "minecraft:frozen_river" },
{ id: 12, color: 0xFFFFFF, name: "minecraft:snowy_plains" },
{ id: 14, color: 0xFF00FF, name: "minecraft:mushroom_fields" },
{ id: 16, color: 0xFADE55, name: "minecraft:beach" },
{ id: 21, color: 0x507B0A, name: "minecraft:jungle" },
{ id: 23, color: 0x608B0F, name: "minecraft:sparse_jungle" },
{ id: 24, color: 0x000030, name: "minecraft:deep_ocean" },
{ id: 25, color: 0xA2A284, name: "minecraft:stony_shore" },
{ id: 26, color: 0xFAF0C0, name: "minecraft:snowy_beach" },
{ id: 27, color: 0x307444, name: "minecraft:birch_forest" },
{ id: 29, color: 0x40511A, name: "minecraft:dark_forest" },
{ id: 30, color: 0x31554A, name: "minecraft:snowy_taiga" },
{ id: 32, color: 0x596651, name: "minecraft:old_growth_pine_taiga" },
{ id: 34, color: 0x5B7352, name: "minecraft:windswept_forest" },
{ id: 35, color: 0xBDB25F, name: "minecraft:savanna" },
{ id: 36, color: 0xA79D64, name: "minecraft:savanna_plateau" },
{ id: 37, color: 0xD94515, name: "minecraft:badlands" },
{ id: 38, color: 0xCA8C65, name: "minecraft:wooded_badlands" },
{ id: 44, color: 0x0000AC, name: "minecraft:warm_ocean" },
{ id: 45, color: 0x000090, name: "minecraft:lukewarm_ocean" },
{ id: 46, color: 0x202070, name: "minecraft:cold_ocean" },
{ id: 48, color: 0x000040, name: "minecraft:deep_lukewarm_ocean" },
{ id: 49, color: 0x202038, name: "minecraft:deep_cold_ocean" },
{ id: 50, color: 0x404090, name: "minecraft:deep_frozen_ocean" },

// 1.18+ Biomes
{ id: 177, color: 0x60A555, name: "minecraft:meadow" },
{ id: 178, color: 0x476B4C, name: "minecraft:grove" },
{ id: 179, color: 0xC4C4C4, name: "minecraft:snowy_slopes" },
{ id: 180, color: 0xDCDCD8, name: "minecraft:jagged_peaks" },
{ id: 181, color: 0xB0C8CE, name: "minecraft:frozen_peaks" },
{ id: 182, color: 0x7B9594, name: "minecraft:stony_peaks" },
{ id: 183, color: 0x031F39, name: "minecraft:deep_dark" },
{ id: 184, color: 0x2CCC8E, name: "minecraft:mangrove_swamp" },
{ id: 185, color: 0xFFC1E0, name: "minecraft:cherry_grove" },
{ id: 186, color: 0x696A85, name: "minecraft:pale_garden" },

// Nether
{ id: 8, color: 0x572526, name: "minecraft:nether_wastes" },
{ id: 170, color: 0x4D3B2E, name: "minecraft:soul_sand_valley" },
{ id: 171, color: 0x981A11, name: "minecraft:crimson_forest" },
{ id: 172, color: 0x49907B, name: "minecraft:warped_forest" },
{ id: 173, color: 0x645F63, name: "minecraft:basalt_deltas" },

// End
{ id: 9, color: 0x8080FF, name: "minecraft:the_end" },
{ id: 40, color: 0x4B4BAB, name: "minecraft:small_end_islands" },
{ id: 41, color: 0xC9C459, name: "minecraft:end_midlands" },
{ id: 42, color: 0xB5DA36, name: "minecraft:end_highlands" },
{ id: 43, color: 0x7070CC, name: "minecraft:end_barrens" },

// Cave
{ id: 174, color: 0x4E3F32, name: "minecraft:dripstone_caves" },
{ id: 175, color: 0x283800, name: "minecraft:lush_caves" },
```

---

## 7. Hillshade 算法（cubiomes-viewer 參考）

根據 cubiomes-viewer/src/world.cpp 的 `applyHeightShading`：

```c
// 3x3 鄰域高度值
// t[row][col] where row=0 is North, col=0 is West
//
//   t[0][0]  t[0][1]  t[0][2]
//   t[1][0]  t[1][1]  t[1][2]   <- center is t[1][1]
//   t[2][0]  t[2][1]  t[2][2]
//

float d0 = t[0][1] + t[1][0];  // North + West
float d1 = t[1][2] + t[2][1];  // East + South
float mul = 0.25 / scale;
float light = 1.0 + (d1 - d0) * mul;

// Clamp to valid range
if (light < 0.5) light = 0.5;
if (light > 1.5) light = 1.5;

// Apply to color
r = r * light;
g = g * light;
b = b * light;
```

### 光源方向

- 光源位於**西北方向**
- 當地形向東南傾斜時 (d1 > d0)，光照增強
- 當地形向西北傾斜時 (d0 > d1)，光照減弱

### 特殊處理

1. **高度超限**：`y > ymax` 時 `light = 0.65`
2. **等高線模式**：每 16 格減少 50% 亮度
3. **洞穴區域**：`terrain < 0` 時使用固定暗色

---

## 8. WASM 中的關鍵錯誤訊息

```
mapHills() requires two parents! Use setupMultiLayer()
mapRiverMix() requires two parents! Use setupMultiLayer()
mapOceanMix() requires two parents! Use setupMultiLayer()
setBiomeSeed(): BiomeNoise is malformed, buffer too small
octavePerlinInit(): unsupported octave range
```

這些錯誤訊息表明 mcseedmap 使用類似 cubiomes 的分層生態系生成邏輯。

---

## 9. btree 資源系統

JS bundle 中發現 `getBiomeTreeUrl`、`updateBiomeTree`、`InitBiomeTree` 等函數，表明使用 btree*.dat 文件進行版本資源管理。

資源路徑格式推測：`/assets/btree-{version}.dat`

---

## 10. 我們的實現 vs mcseedmap

| 方面 | mc-seed-marker | mcseedmap.net |
|------|---------------|---------------|
| 生態系引擎 | deepslate (TypeScript) | cubiomes (WASM) |
| hillshade | 前端 TypeScript | WASM 內部 |
| 顏色來源 | 自定義 biomeColors.ts | JS bundle + SetBiomeColor |
| 等高線 | 前端繪製 | WASM 內部 |

---

## 11. 已完成的修復

### 11.1 Hillshade 座標系統修復

**問題**：海洋看起來比陸地高，hillshade 方向完全相反。

**根本原因**：
- `generateTile()` 中 `min.y *= -1` 翻轉了 Y 軸
- 導致 array 中的 z 方向與視覺上的 North/South 相反
- 我們的 `hN`（小 z）實際上是視覺上的 South
- 我們的 `hS`（大 z）實際上是視覺上的 North

**修復**：
```typescript
// BiomeLayer.ts 第 171 行
// 交換 hN 和 hS 以對齊視覺方向
hillshade = calculateHillshadeSimple(hS, hN, hE, hW, hillshadeScale, false)
```

### 11.2 生態系顏色更新

- 從 mcseedmap.net JS bundle 提取完整色表
- 更新 `src/config/biomeColors.ts` 使用精確十進制顏色值
- 新增 `getMcseedmapBiomeColor()` 函數
- 更新 `useLoadedDimensionStore.ts` 優先使用 mcseedmap 顏色

---

## 12. 待優化項目

1. **Stepped shader 模式**：實現階梯式 hillshade
2. **等高線優化**：對齊 mcseedmap 的 ContourKind 實現
3. **洞穴區域處理**：優化 terrain < 0 的視覺效果
4. **性能優化**：考慮使用 WASM 進行渲染

---

## 附錄：分析工具

```bash
# 安裝 wabt
brew install wabt

# 轉換 WASM 為 WAT
wasm2wat mcseedmap.wasm -o mcseedmap.wat

# 反編譯為 C-like 代碼
wasm-decompile mcseedmap.wasm -o mcseedmap.dcmp

# 提取字串
strings mcseedmap.wasm | grep -i biome
```
