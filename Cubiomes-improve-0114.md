# Cubiomes 渲染效能問題分析（0114）

## 問題
- Cubiomes（開源）渲染速度遠慢於 mcseedmap.wasm，已慢到不可用。
- 切換到 Cubiomes 後，地圖更新明顯卡頓、出圖延遲長。

## 根因
1) Worker 未被充分利用
- Cubiomes 的 `processTaskQueue()` 一次只派發 1 個任務，其他 worker 都閒置。
- mcseedmap 版本用 while 迴圈一次把所有 idle worker 填滿。
- 結果：理論上的多工變成單工，直接降低吞吐量。

2) 高度圖（hillshade）在主執行緒做超重計算
- `executeTask()` 內用 `DensityFunction` 在主執行緒逐格掃描 + 二分搜尋。
- 每個 tile 都要跑一遍，CPU 直接爆，UI 也會卡。

3) BMP 解碼用 JS 逐像素寫 ImageData
- Cubiomes 目前用 DataView 逐像素寫入 ImageData，成本高。
- mcseedmap 用 `createImageBitmap()` 走瀏覽器內建解碼，快很多。

## 修改方式（具體做法）
### 1) 修 worker 排程（必做）
目標：讓所有 idle worker 同時有任務在跑。
- 檔案：`src/MapLayers/CubiomesBiomeLayer.ts`
- 改法：把 `processTaskQueue()` 改成 while 迴圈，跟 `McseedmapBiomeLayer` 一樣。

### 2) BMP 解碼改成 createImageBitmap（低風險）
目標：減少主執行緒像素處理時間。
- 檔案：`src/MapLayers/CubiomesBiomeLayer.ts`
- 改法：參考 mcseedmap 做法，用 `createImageBitmap(new Blob([buffer], { type: 'image/bmp' }))` 繪製。

### 3) 將高度圖計算移出主執行緒（關鍵）
有兩種方案，擇一：

方案 A（最快、工程小）
- 不再傳入主執行緒計算的 heightmap。
- 直接在 worker 內使用 `cubiomes_gen_heightmap()`。
- 風險：視覺可能有細微差異，需要驗證。

方案 B（保留視覺、工程較大）
- 將現有 `DensityFunction` 高度計算邏輯搬到 worker 執行。
- 主執行緒只負責派任務與繪製。
- 好處：效能提升且視覺保持一致。

## 實作檔案清單
- `src/MapLayers/CubiomesBiomeLayer.ts`
  - 修 `processTaskQueue()` 排程
  - 改 BMP 解碼流程
  - 視情況移除/搬移主執行緒高度圖計算
- `src/cubiomes/cubiomes-worker.ts`
  - 方案 A：使用 `cubiomes_gen_heightmap()`（若主執行緒不再傳入 heightmap）
  - 方案 B：新增計算高度圖的 worker 端邏輯（對應主執行緒移除）
- （若選方案 B）`src/MapLayers/CubiomesBiomeLayer.ts`
  - 需要調整參數傳遞與 worker API（例如把 heightmap 設為 worker 內部生成）

## Checklist
- [ ] `processTaskQueue()` 改為 while 迴圈，同時派發所有 idle worker 任務
- [ ] Cubiomes 的 BMP 解碼改用 `createImageBitmap()`
- [ ] 方案 A：移除主執行緒 heightmap 計算，改用 worker 內建 `cubiomes_gen_heightmap()`
- [ ] 方案 B：把現有 heightmap 算法移到 worker，主執行緒只傳參數
- [ ] 用相同 seed/zoom 對比 cubiomes vs mcseedmap 視覺一致性
- [ ] 測量切換到 cubiomes 後首屏渲染時間（體感 + FPS/主執行緒負載）
- [ ] 確認多 worker 確實同時跑（CPU 使用率）
