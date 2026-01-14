# Chunkbase 結構資訊來源研究報告

> 研究日期：2026-01-06
> 目的：分析 Chunkbase 如何獲取豐富的結構詳細資訊，以及 MC Seed Marker 如何實現相同功能

---

## 一、Chunkbase 顯示的結構詳細資訊

### 1. Overworld - Village
- **顯示內容**：`Plains Village`、`Desert Village` 等
- **資料來源**：座標所在的生態系 ID
- **技術實現**：查詢 (x, z) 座標的生態系，直接映射到村莊類型

### 2. Nether - Nether Fortress
- **顯示內容**：`Nether Fortress (Crossing)`
- **資料來源**：Fortress 結構生成演算法
- **技術實現**：Fortress 起始點有不同類型（Crossing、Corridor 等）

### 3. Nether - Bastion Remnant
- **顯示內容**：`Bastion (Housing units)`、`Bastion (Hoglin stables)`、`Bastion (Treasure room)`、`Bastion (Bridge)`
- **資料來源**：Bastion 使用 jigsaw 結構系統，種子決定類型
- **技術實現**：根據種子和座標計算 Bastion 變體

### 4. End - End City
- **顯示內容**：`Likely End City (with ship)` / `Likely End City (without ship)`
- **資料來源**：End City 使用 jigsaw 結構生成
- **技術實現**：生成完整結構件列表，檢查是否包含 ship 組件
- **注意**：標註「Likely」表示機率判斷，非 100% 確定

---

## 二、cubiomes 支援情況

經查 cubiomes 原始碼（`finders.h` / `finders.c`），**有對應 API 可產出上述資訊**，但需要自行做 mapping/判斷：

### 可用 API 函數

| 功能 | 函數名 | 說明 |
|------|--------|------|
| End City Ship | `getEndCityPieces()` | 生成最多 421 個結構件，可判斷是否包含 ship |
| Bastion Type | `getVariant()` | 以 `r->start` 回傳 0..3，需自行對應類型名稱 |
| Nether Fortress | `getFortressPieces()` | 生成完整走廊/橋梁配置 |

### Bastion 類型對應（需自訂 mapping）

> cubiomes 沒有內建 `BASTION_*` 常數；`getVariant()` 的 `r->start` 只回傳 0..3。

### End City Ship 檢測

[GitHub Issue #55](https://github.com/Cubitect/cubiomes/issues/55) 已於 2022-09-26 關閉，確認「End city pieces generation is now supported」。

---

## 三、MC Seed Marker 實作建議

### 目前狀態
- 專案已整合 cubiomes WASM（`src/cubiomes/`）
- 目前僅用於生態系渲染
- 結構計算使用 deepslate

### 需要的修改

#### 1. 擴展 cubiomes_wrapper.c

```c
// 新增：獲取 Bastion 類型
EMSCRIPTEN_KEEPALIVE
int cubiomes_get_bastion_type(int blockX, int blockZ) {
    // 使用 getVariant() 實現
}

// 新增：檢測 End City 是否有 ship
EMSCRIPTEN_KEEPALIVE
int cubiomes_end_city_has_ship(int blockX, int blockZ) {
    // 使用 getEndCityPieces() 實現
}

// 新增：獲取 Fortress 起始類型
EMSCRIPTEN_KEEPALIVE
int cubiomes_get_fortress_type(int blockX, int blockZ) {
    // 使用 getFortressPieces() 實現
}
```

#### 2. 修改結構彈窗組件

在 `MainMap.vue` 的結構彈窗中添加：
- End City：顯示 `(with ship)` / `(without ship)`
- Bastion：顯示類型名稱
- Village：顯示村莊類型（根據生態系）

#### 3. 工作量預估

| 任務 | 複雜度 |
|------|--------|
| 擴展 cubiomes_wrapper.c | 中等 |
| 重新編譯 WASM | 低 |
| TypeScript 類型定義 | 低 |
| 修改彈窗 UI | 低 |

---

## 四、其他 Chunkbase 功能

### 已確認功能
- ✅ Completed 勾選框（追蹤已探索結構）
- ✅ TP 指令複製按鈕
- ✅ 維度專屬結構列表（End 只顯示 End City + End Gateway）
- ✅ 縮放提示（「⚠ Zoom in to show all selected features」）

### MC Seed Marker 已有功能
- ✅ Structure Notes（自定義備註）
- ✅ 自定義圖示

---

## 五、資料來源

- [cubiomes GitHub](https://github.com/Cubitect/cubiomes)
- [cubiomes finders.h](https://raw.githubusercontent.com/Cubitect/cubiomes/master/finders.h)
- [cubiomes finders.c](https://raw.githubusercontent.com/Cubitect/cubiomes/master/finders.c)
- [cubiomes finders.h](https://github.com/Cubitect/cubiomes/blob/master/finders.h)
- [End City Ship Issue #55](https://github.com/Cubitect/cubiomes/issues/55)
- [cubiomespi PyPI](https://pypi.org/project/cubiomespi/)（Python wrapper，僅供參考）
