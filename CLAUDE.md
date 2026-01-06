# CLAUDE.md - MC Seed Marker

Minecraft 種子地圖視覺化工具，基於 jacobsjo/mc-seed-map 開源專案修改。

> **注意**：此專案獨立於 cayoh.run 主站和 VidCast，技術棧和開發流程完全不同。

## 技術棧

- **框架**: Vue 3 + TypeScript
- **建構工具**: Vite
- **狀態管理**: Pinia
- **地圖渲染**: Leaflet
- **生態系渲染**: mcseedmap WASM（多 Worker 並行）
- **結構計算**: deepslate
- **資料持久化**: IndexedDB (idb-keyval)
- **國際化**: vue-i18n

## 開發指令

```bash
# 安裝依賴
npm install

# 本地開發（預設 port 5173）
npm run dev

# 生產構建
npm run build

# 生成 vanilla datapacks（需要 Python）
npm run createZips
```

## 專案結構

```
mc-seed-marker/
├── src/
│   ├── App.vue                    # 主應用入口
│   ├── main.ts                    # Vue 初始化
│   ├── stores/                    # Pinia stores
│   │   ├── useLoadedDimensionStore.ts  # 維度和結構載入
│   │   ├── useStructureNotesStore.ts   # 結構備註和自定義圖示
│   │   ├── useSettingsStore.ts         # 設定（種子、版本等）
│   │   ├── useBiomeSearchStore.ts      # 生態系搜尋
│   │   ├── useMarkersStore.ts          # 自定義標記
│   │   └── useUiStore.ts               # UI 狀態
│   ├── components/
│   │   ├── MainMap.vue            # 主地圖組件（Leaflet）
│   │   ├── Sidebar.vue            # 側邊欄
│   │   └── ...
│   ├── MapLayers/                 # 地圖圖層
│   │   ├── McseedmapBiomeLayer.ts # 生態系渲染（WASM + 多 Worker）
│   │   └── Graticule.ts           # 座標格線
│   ├── mcseedmap/                 # mcseedmap.net 資源
│   │   ├── mcseedmap.wasm         # WASM 渲染引擎
│   │   ├── mcseedmap-worker.js    # Worker 封裝
│   │   └── btree/                 # 生態系快查表
│   └── BuildIn/                   # 內建資料
│       ├── VanillaItems.ts        # MC 物品列表
│       └── MultiNoiseBiomeParameterList.ts
├── public/
│   ├── structure-icons/           # 結構圖示（mcseedmap.net 授權）
│   └── vanilla_datapacks/         # MC 版本 datapacks
├── locales/                       # 多語言翻譯
├── CHANGELOG.md                   # 變更記錄
└── TODO.md                        # 待辦事項
```

## 關鍵功能

### 結構備註系統 (`useStructureNotesStore.ts`)
- 為每個結構位置添加文字備註
- 自定義圖示選擇（18 種結構圖示）
- IndexedDB 持久化儲存
- 圖示優先級：用戶自定義 > 預設映射 > Datapack > 隨機

### 地圖渲染 (`MainMap.vue`)
- Leaflet 地圖整合
- 結構標記和彈窗
- 生態系 tile 渲染
- 座標顯示和導航

### 世界生成 (`useLoadedDimensionStore.ts`)
- 使用 deepslate 庫計算結構位置
- 支援多維度（主世界、地獄、乙太）
- Datapack 載入和解析

## 資料架構

地圖渲染依賴三層資料，缺一不可：

### 1. Vanilla Datapacks（規則書）
- **是什麼**：從 Minecraft JAR 提取的遊戲規則
- **內容**：生態系定義、結構生成規則、維度設定
- **來源**：[misode/mcmeta](https://github.com/misode/mcmeta) 自動解包
- **路徑**：`public/vanilla_datapacks/*.zip`
- **生成**：`npm run createZips`（執行 `scripts/createVanillaZips.py`）

### 2. Biome Tree（快查表）
- **是什麼**：預計算的生態系查找表
- **作用**：座標 (X, Z) → 生態系 ID，避免每格重算
- **來源**：mcseedmap.net 提供
- **路徑**：`src/mcseedmap/btree/*.dat`
- **版本對應**：不同 MC 版本用不同 btree（如 `btree21wd.dat`）

### 3. WASM 渲染引擎
- **是什麼**：Rust 編譯的 WebAssembly，模擬 MC 世界生成
- **來源**：mcseedmap.net（閉源，公開下載）
- **路徑**：`src/mcseedmap/mcseedmap.wasm` + `mcseedmap-worker.js`
- **優勢**：比 deepslate（JS）快 3-5 倍，顏色還原度高

### 資料流程
```
用戶輸入種子
    ↓
WASM 引擎讀取 datapacks 規則
    ↓
查 biome tree 快速得到生態系
    ↓
套用顏色表渲染 tile
    ↓
Leaflet 顯示地圖
```

## 上游專案

### jacobsjo/mc-seed-map
- **GitHub**：https://github.com/jacobsjo/mc-seed-map
- **關係**：本專案 fork 自此
- **差異**：我們改用 mcseedmap WASM、新增標記系統、重設計 UI

### deepslate
- **GitHub**：https://github.com/jacobsjo/deepslate
- **用途**：計算結構位置（村莊、要塞等）
- **限制**：某些結構（如紫水晶洞）不支援

### mcseedmap.net
- **網站**：https://mcseedmap.net
- **授權**：結構圖示已獲授權使用
- **來源**：WASM 引擎、btree 檔案、顏色配置

## 注意事項

- 某些結構（如紫水晶洞）可能不顯示，這是 deepslate 庫的限制
- 結構圖示來自 mcseedmap.net（已獲授權）
- 開發時需先執行 `npm run createZips` 生成 datapack
- 切換維度會強制重發 btree 到所有 worker（避免藍圖問題）
