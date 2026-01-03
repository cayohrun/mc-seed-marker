# mcseedmap.net 完全復刻方案

## 目標
完全復刻 mcseedmap.net 的渲染效果：
- ✅ hillshade 地形陰影
- ✅ 生態系顏色
- ✅ 所有視覺效果完全一致

---

## ⚠️ 關鍵風險警告

**換引擎 ≠ 完全復刻**

mcseedmap.net 使用自定義的 SmGenerator WASM，包含：
- 自定義色表/高亮/等高線/海平面特效
- btree*.dat 版本資源樹
- 可能與 cubiomes/cubiomes-viewer 有差異的 hillshade 實現

**如果目標是「完全復刻」，應優先解析 mcseedmap 的 WASM 行為，而非換成另一個引擎。**

---

## 方案選擇

### 方案 A：解析 mcseedmap WASM（推薦，真正復刻）
直接分析 mcseedmap.net 的 WASM，提取其算法

### 方案 B：使用 cubiomes WASM（較快，但可能無法完全對齊）
基於開源 cubiomes 編譯 WASM，參考 cubiomes-viewer hillshade

---

## 方案 A：解析 mcseedmap WASM

### Phase 1：WASM 分析
1. 下載 mcseedmap.net 的 WASM 文件
2. 使用 wasm-decompile / wasm2wat 分析
3. 找出 `SmGenerator.GenerateBiomeImage` 的實現
4. 提取 hillshade / mapHills 算法

⚠️ **注意**：mcseedmap WASM 可能沒有 names section（exports 只有 w/x/y/z/A/B 等），函式名通常在 JS glue/embind 註冊。**需同步分析 JS bundle 的 embind 映射**，不能只靠 WASM 反編譯。

### Phase 2：關鍵點提取
- 色表（biome colors）
- hillshade 公式與參數
- btree 資源處理邏輯
- scale/zoom 座標轉換

⚠️ **btree 資源獲取**：從 mcseedmap assets 抓取 btree*.dat 並建立版本映射（JS bundle 內有列出資源路徑）。

### Phase 3：TypeScript 重現
基於提取的算法，在現有架構中重現

### 優點
- 真正的「完全復刻」
- 不需要編譯 WASM

### 缺點
- 需要反向工程技能
- 可能涉及法律風險（需評估）

---

## 方案 B：cubiomes WASM（備選）

### 參考資源

| 資源 | 說明 | 用途 |
|------|------|------|
| [worker-biomes](https://github.com/lspgn/worker-biomes) | cubiomes WASM 編譯參考 | 編譯配置參考（非算法對齊） |
| [cubiomes](https://github.com/Cubitect/cubiomes) | C 核心庫 (MIT) | 生態系計算 |
| [cubiomes-viewer](https://github.com/Cubitect/cubiomes-viewer) | hillshade 參考 (GPL-3.0) | 算法參考（可能與 mcseedmap 不同） |

### ⚠️ 注意
- worker-biomes 是 Cloudflare PNG tiles 流程，與 mcseedmap client-side 渲染不同
- cubiomes-viewer 的 `applyHeightShading()` **不能確認**與 mcseedmap 相同
- 缺少 btree*.dat 版本資源處理，新版本結果可能偏差

---

## 方案 B 實施階段（若選擇此方案）

### Phase 1：WASM 編譯
1. Clone worker-biomes 研究編譯配置
2. 編譯 cubiomes.wasm
3. 添加 hillshade（參考 cubiomes-viewer，但需驗證）

### Phase 2：封裝 API
```c
EMSCRIPTEN_KEEPALIVE
uint8_t* generateBiomeImage(
    int64_t seed,
    int x, int z,
    int width, int height,
    int scale,
    int mcVersion
);
```

### Phase 3：專案整合
1. 新增 `src/wasm/cubiomes.wasm`
2. 新增 `src/webworker/CubiomesWorker.ts`
3. 修改 `src/MapLayers/BiomeLayer.ts`

### Phase 4：驗證
1. 與 mcseedmap.net 對比（**預期會有差異**）
2. 性能測試
3. 版本兼容測試

---

## 文件結構變更（僅方案 B）

```
src/
├── wasm/                          [新增目錄]
│   ├── cubiomes.wasm              # 編譯後的 WASM 模組
│   └── cubiomes.js                # Emscripten 膠水代碼
├── webworker/
│   ├── MultiNoiseCalculator.ts    [保留] 用於結構位置計算
│   └── CubiomesWorker.ts          [新增] 調用 WASM 渲染
└── MapLayers/
    └── BiomeLayer.ts              [修改] 使用 CubiomesWorker
```

**方案 A 不需要新增 WASM 文件**，僅修改現有 TypeScript 代碼。

---

## 技術細節

### 與現有架構對比（方案 B）

| 方面 | 現有 (deepslate) | 方案 B (cubiomes WASM) |
|------|-----------------|---------------------|
| 生態系計算 | TypeScript | C (WASM) |
| hillshade | 前端計算（有問題） | WASM 內部（**未必與 mcseedmap 一致**） |
| 輸出格式 | JSON 數據 | RGBA ArrayBuffer |
| 性能 | 中等 | 更快（原生代碼） |

### 方案 A 需要的改動
1. **hillshade**：還原 mcseedmap 算法到 TypeScript
2. **色表**：對齊 mcseedmap 生態系顏色
3. **視覺效果**：還原等高線/海平面特效（若有）

### 方案 B 需要的改動
1. **輸出格式**：RGBA ArrayBuffer 而非 PNG
2. **hillshade**：整合 cubiomes-viewer 的算法（**可能與 mcseedmap 不同**）
3. **版本支援**：映射 MC 版本到 cubiomes 版本常量
4. **視覺對齊**：需額外處理色表/高亮/等高線/海平面效果

### deepslate 保留用途
- 結構位置計算（StructureLayer）
- Datapack 解析
- 其他非渲染功能

---

## 風險矩陣

| 風險 | 影響 | 方案 A 緩解 | 方案 B 緩解 |
|------|------|------------|------------|
| hillshade 無法對齊 | 高 | 直接從源頭提取 | 可能無解 |
| btree 資源缺失 | 中 | 一併提取 | 需額外處理 |
| 法律風險 | 中 | 需評估反向工程合法性 | 確認不直接移植 GPL 代碼，評估合規 |
| 開發複雜度 | 中 | 需反向工程技能 | 需 C/WASM 編譯 |
| 性能 | 低 | 保持現有架構 | WASM 可能更快 |

---

## 待確認問題

1. **mcseedmap GenerateBiomeImage 是否含自定義視覺層？**
   - 色表
   - 高亮效果
   - 等高線
   - 海平面特效

2. **btree*.dat 處理邏輯？**
   - 版本映射
   - 資源載入

3. **反向工程 mcseedmap WASM 的法律風險？**
   - 需要法律評估

---

## 測試資源

**測試種子**: `5801844188909832591`

對比位置建議：
- 海洋/陸地邊界
- 山脈區域
- 平原區域

---

## 參考連結

- mcseedmap.net: https://mcseedmap.net/
- cubiomes: https://github.com/Cubitect/cubiomes
- cubiomes-viewer: https://github.com/Cubitect/cubiomes-viewer
- worker-biomes: https://github.com/lspgn/worker-biomes
- Emscripten: https://emscripten.org/
