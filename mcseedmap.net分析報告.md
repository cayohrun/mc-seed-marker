# mcseedmap.net 技術分析報告

## 概述

mcseedmap.net 是目前最準確的 Minecraft 種子地圖視覺化工具，其渲染效果（包括 hillshade 地形陰影）被視為標準參考。本報告分析其技術架構，以便復刻其效果。

> **注意**：本報告部分內容基於觀察和推論，已明確標註。未標註的為已確認事實。

---

## 技術架構

### 核心引擎

mcseedmap.net 使用 WebAssembly 進行生態系計算和渲染。

#### 已確認

| 項目 | 說明 |
|------|------|
| **WASM 模組** | 網站使用 WebAssembly 模組進行核心計算 |
| **SmGenerator** | WASM 導出的主要類別，包含 `GenerateBiomeImage()` 等方法 |
| **GenerateBiomeImage 回傳** | 回傳 ArrayBuffer/Uint8Array 影像資料（從 JS 解包確認） |

#### 已觀察到字串（不等於導出或實際被呼叫）

| 項目 | 說明 |
|------|------|
| **mapHills** | WASM 二進位內觀察到此字串 |
| **ShaderKind / ContourKind** | WASM 二進位內觀察到這些字串 |

#### 推論（待驗證）

| 項目 | 說明 | 可信度 |
|------|------|--------|
| 基於 cubiomes | WASM 可能基於 cubiomes 庫或其衍生版本 | 中 |
| Emscripten 編譯 | 推測使用 Emscripten 將 C/C++ 編譯為 WASM | 中 |
| SmGenerator 封裝 | 明顯有自定義封裝層，不是原生 cubiomes 直接輸出 | 高 |

### WASM 調用流程（已確認）

```
前端 JavaScript
    │
    ▼
SmGenerator.GenerateBiomeImage(...)
    │
    ▼
返回 ArrayBuffer → 前端包成 Uint8Array/ImageData → Canvas 顯示
```

前端直接調用 `SmGenerator.GenerateBiomeImage()` 獲取渲染完成的圖像數據（ArrayBuffer），再包成 Uint8Array 或 ImageData 繪製到 Canvas。

---

## 開源 vs 閉源分析

### 相關開源項目

| 組件 | 開源狀態 | 位置 | 與 mcseedmap 關係 |
|------|---------|------|------------------|
| cubiomes 核心庫 | ✅ 開源 (MIT) | github.com/Cubitect/cubiomes | **可能來源**，未證實 |
| cubiomes-viewer 桌面版 | ✅ 開源 (GPL-3.0) | github.com/Cubitect/cubiomes-viewer | **可能參考**，未證實 |

### mcseedmap.net 閉源部分

| 組件 | 狀態 | 說明 |
|------|------|------|
| WASM 模組源碼 | ❌ 閉源 | SmGenerator 等封裝的 C/C++ 源碼未公開 |
| 網站前端代碼 | ❌ 混淆 | JavaScript 經過混淆處理 |
| mapHills 實作 | ❌ 未知 | 觀察到 mapHills 字串，實作未知 |
| hillshade 公式 | ❌ 未知 | 無法確認是否與 cubiomes-viewer 相同 |

---

## Hillshade 算法

### cubiomes-viewer 實現（參考，非 mcseedmap 確認來源）

> **警告**：以下是 cubiomes-viewer 桌面版的算法，**不能確認** mcseedmap.net 使用相同實現。

```c
// 來源：cubiomes-viewer/src/world.cpp（參考用）
// t[row][col] 是 3x3 鄰域的高度值

float d0 = t[0][1] + t[1][0];  // North + West
float d1 = t[1][2] + t[2][1];  // East + South
float mul = 0.25 / scale;
float light = 1.0 + (d1 - d0) * mul;

if (light < 0.5) light = 0.5;
if (light > 1.5) light = 1.5;
```

### mcseedmap.net hillshade（待確認）

目前只知道：
- 觀察到 `mapHills` 字串，可能為內部函數名
- 觀察到 `ShaderKind` / `ContourKind` 字串，可能為相關邏輯
- **具體公式、scale 參數、座標對應關係均未知**

需要：
1. 找到 SmGenerator / mapHills 的源碼，或
2. 反編譯 WASM 分析實際算法

---

## 我們的架構 vs mcseedmap.net

### mcseedmap.net 架構（已確認）

```
┌─────────────────────────────────────────────────────────┐
│  WASM 模組 (SmGenerator)                                │
│  ├─ GenerateBiomeImage() - 主要渲染方法                 │
│  ├─ （內部可能使用 mapHills 等邏輯，未確認）             │
│  └─ 返回 ArrayBuffer/Uint8Array 影像資料                │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  JavaScript 前端                                         │
│  ├─ tile/zoom/scale 座標處理                            │
│  └─ 將圖像數據繪製到 Canvas                             │
└─────────────────────────────────────────────────────────┘
```

**注意**：前端仍然進行 tile/zoom/scale 的座標處理，不能排除座標轉換問題。

### 我們的架構 (mc-seed-marker)

```
┌─────────────────────────────────────────────────────────┐
│  Web Worker (MultiNoiseCalculator.ts)                   │
│  ├─ 使用 deepslate 計算生態系和高度                      │
│  └─ 返回 { surface, biome, terrain } 數據陣列           │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  前端 (BiomeLayer.ts)                                    │
│  ├─ 接收數據陣列                                         │
│  ├─ 在 TypeScript 中計算 hillshade                      │
│  └─ 繪製到 Canvas                                        │
└─────────────────────────────────────────────────────────┘
```

### 關鍵差異

| 方面 | mcseedmap.net | mc-seed-marker |
|------|---------------|----------------|
| 生態系引擎 | SmGenerator (WASM) | deepslate (TypeScript) |
| Hillshade 計算位置 | WASM 內部 | 前端 TypeScript |
| 數據格式 | 直接返回圖像 | 返回結構化數據再渲染 |
| hillshade 公式 | **未知** | 參考 cubiomes-viewer（可能不同） |

---

## 當前問題

### 症狀
海洋看起來比陸地高，hillshade 方向完全相反。

### 注意：可能影響視覺判斷的因素

我們的實現有額外的渲染邏輯可能影響視覺效果：
- **terrain < 0 時的特殊處理**：洞穴/水下區域使用固定 hillshade = 0.15（極暗）
- **sea level 波浪效果**：海平面以下區域有特殊渲染
- 這些濾色效果可能與 hillshade 方向問題疊加，造成更明顯的「海洋比陸地高」錯覺

### 待確認項目

1. **mcseedmap hillshade 公式**
   - 需要找到 SmGenerator / mapHills 源碼
   - 或反編譯 WASM 分析算法

2. **scale 參數對應關係**
   - mcseedmap 的 tileSize/zoom 如何轉換為 hillshade scale
   - 我們的 step 參數是否對應正確

3. **座標系統對齊**
   - mcseedmap 前端的座標處理邏輯
   - 東/西/北/南在各層的對應關係

---

## 下一步建議

### 優先級 1：尋找源碼
- 搜索是否有 SmGenerator 或 mcseedmap WASM 的開源版本
- 聯繫 mcseedmap 開發者詢問

### 優先級 2：反編譯分析
- 使用 wasm2c 或 wasm-decompile 分析 WASM
- 找出 mapHills() 的具體實現

### 優先級 3：黑盒測試
- 在 mcseedmap 上測試特定地形的 hillshade 效果
- 記錄高度值和亮度對應關係
- 反推公式

---

## 參考資源

- cubiomes: https://github.com/Cubitect/cubiomes （可能相關）
- cubiomes-viewer: https://github.com/Cubitect/cubiomes-viewer （可能參考）
- deepslate: https://github.com/misode/deepslate
- mcseedmap.net: https://mcseedmap.net/

---

## 附錄：測試種子

用於對比測試的種子：`5801844188909832591`

---

## 修訂記錄

| 日期 | 修訂內容 |
|------|---------|
| 2026-01-03 | 初版，包含部分臆測 |
| 2026-01-03 | v2：標註未證實內容，更正 WASM API 描述 |
| 2026-01-03 | v3：區分「已確認」vs「已觀察到字串」；標註 GenerateBiomeImage 回傳類型；添加 terrain/cave 濾色影響說明 |
| 2026-01-03 | v4：修正 mapHills 描述為「觀察到字串」；補充前端 ArrayBuffer→Uint8Array/ImageData 流程 |
| 2026-01-03 | v5：統一閉源表格中 mapHills 描述 |
