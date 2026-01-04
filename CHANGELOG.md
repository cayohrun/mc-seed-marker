# Changelog

## [1.3.0] - 2026-01-04 (地圖穩定版)

### Performance
- 多 Worker 並行渲染：自動使用 min(16, CPU 核心數-1) 個 worker
- btree 快取共享：fetch 一次後分發給所有 worker，避免重複下載
- 任務取消機制：透過 requestId 判斷過期任務，丟棄 stale 結果

### Fixed
- 修復生態系渲染線條過粗問題（tileSize 64→256，zoomSnap 0.5→1）
- 修復快速拖動時 tile 閃白/缺片的問題
- 修復取消任務時誤殺新 tile 的 bug（每個 task 綁定自己的 done callback）

### Technical
- Worker Pool 架構：SSR 安全的 worker 數量計算
- Barrier 機制：config 更新時暫停任務處理，確保正確渲染順序
- Version Lock：configUpdateId/btreeLoadId 防止 race condition
- Disposed Flag：layer 移除後停止所有操作

## [1.2.0] - 2026-01-03

### Added
- 完全復刻 mcseedmap.net 生態系渲染效果
- 引入 mcseedmap.net 原版 WASM 渲染引擎
- Hillshade 地形陰影效果
- 支援多版本 btree 資源 (MC 1.18 - 1.21.5)
  - btree18.dat, btree19.dat, btree192.dat
  - btree20.dat, btree21wd.dat, btree215.dat
- McseedmapBiomeLayer：新的生態系渲染圖層

### Changed
- 生態系渲染從 deepslate MultiNoise 改為 mcseedmap WASM
- 使用 Comlink 進行 Web Worker 通訊
- 圖像解碼改用 createImageBitmap 處理 BMP 格式

### Technical
- 初始化順序：WASM → setColors → configure → setBiomeTree
- 90 種生態系顏色（與 mcseedmap.net 完全一致）
- 支援 hillshade 開關切換

## [1.1.0] - 2026-01-03

### Added
- 結構備註功能：可為每個結構位置添加文字備註
- 自定義圖示功能：可為每個結構位置或結構類型選擇不同圖示
- 18 種結構專用圖示（來源：mcseedmap.net，已獲授權）
  - 村莊、沙漠神殿、叢林神殿、海底神殿、林地府邸
  - 掠奪者前哨站、要塞、廢棄礦坑、沉船、埋藏的寶藏
  - 廢棄傳送門、女巫小屋、冰屋、遠古城市、古蹟廢墟
  - 試煉密室、海底遺跡、紫水晶洞
- 圖示下拉選單：支援 18 種結構圖示選擇
- 資料持久化：使用 IndexedDB 儲存備註和自定義圖示

### Changed
- 圖示優先級調整：用戶自定義 > 預設映射 > Datapack > 隨機
- 結構圖示改用本地 webp/png 檔案，減少外部依賴

### Fixed
- 修復自定義圖示選擇後顯示破圖的問題
- 修復試煉密室缺少圖示選項的問題
- 修復圖示路徑處理邏輯，支援本地路徑和遠端 URL

## [1.0.0] - 初始版本

### Features
- 基於 jacobsjo/mc-seed-map 開源專案
- Minecraft 種子地圖視覺化
- 多維度支援（主世界、地獄、乙太）
- 結構位置顯示
- 生態系渲染
