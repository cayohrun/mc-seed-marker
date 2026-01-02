# MC Seed Marker

基於 [mc-datapack-map](https://github.com/jacobsjo/mc-datapack-map) 的 Minecraft 種子地圖工具，加入了**自訂標記功能**。

## 功能特色

### 原有功能（繼承自 mc-datapack-map）
- 🗺️ 輸入種子查看生態系地圖
- 🏛️ 顯示村莊、要塞、神殿等結構位置
- 📦 支援載入 Datapack 和 Mod
- 🌍 支援多維度（主世界、地獄、終界）
- 🎮 支援 Minecraft 1.19 ~ 1.21.11 版本

### 新增功能：自訂標記
- 📍 **右鍵點擊地圖** 快速新增標記
- ✏️ 自訂標記名稱、顏色（8種）、圖示（8種）
- 💾 標記自動儲存到瀏覽器（IndexedDB）
- 📤 匯出/匯入標記 (JSON 格式)
- 🔍 點擊標記列表可跳轉到該位置

## 使用方式

### 開發環境
```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建構生產版本
npm run build
```

### 標記操作
1. **新增標記**：右鍵點擊地圖任意位置
2. **查看標記**：左側「自訂標記」面板
3. **跳轉位置**：點擊標記名稱
4. **編輯標記**：點擊鉛筆圖示
5. **刪除標記**：點擊垃圾桶圖示
6. **匯出/匯入**：使用面板上方的按鈕

### 快捷操作
- **右鍵**：新增標記
- **Shift + 左鍵**：複製傳送指令

## 版本支援

| 版本 | 支援狀態 |
|------|---------|
| 1.21.11 | ✅ 完整支援 |
| 1.21.7 | ✅ 完整支援 |
| 1.21.5 | ✅ 完整支援 |
| 1.21.4 | ✅ 完整支援 |
| 1.21.3 | ✅ 完整支援 |
| 1.21.1 | ✅ 完整支援 |
| 1.20.x | ✅ 完整支援 |
| 1.19.x | ✅ 完整支援 |

## 技術棧

- Vue 3 + TypeScript
- Vite
- Leaflet (地圖渲染)
- deepslate (Minecraft 資料處理)
- Pinia (狀態管理)
- idb-keyval (IndexedDB 儲存)

## 致謝

- [jacobsjo/mc-datapack-map](https://github.com/jacobsjo/mc-datapack-map) - 原始專案
- [misode/deepslate](https://github.com/misode/deepslate) - Minecraft 資料處理庫

## 授權

MIT License
