# CLAUDE.md - MC Seed Marker

Minecraft 種子地圖視覺化工具，基於 jacobsjo/mc-seed-map 開源專案修改。

> **注意**：此專案獨立於 cayoh.run 主站和 VidCast，技術棧和開發流程完全不同。

## 技術棧

- **框架**: Vue 3 + TypeScript
- **建構工具**: Vite
- **狀態管理**: Pinia
- **地圖渲染**: Leaflet
- **MC 世界生成**: deepslate
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
│   │   ├── BiomeLayer.ts          # 生態系渲染
│   │   └── Graticule.ts           # 座標格線
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

## 注意事項

- 某些結構（如紫水晶洞）可能不顯示，這是 deepslate 庫的限制
- 結構圖示來自 mcseedmap.net（已獲授權）
- 開發時需先執行 `npm run createZips` 生成 datapack
