# CHUNKBASE-INSPIRED-OPTIMIZATION-20260106（草稿）

> 目的：借镜 Chunkbase 的可用性与资讯完整度，优化 MC Seed Marker，同时**保持目前视觉效果完全一致**。

## 要改的三件事（置顶）

1. **不同维度对应正确结构**
   - 主世界 / 地狱 / 终界结构必须分开，绝不混在一起。
2. **补齐结构资讯来源与内容**
   - 例如 End City 的 ship 判断与呈现，以及结构弹窗资讯更完整。
3. **缩放显示机制优化（照 Chunkbase 的来）**
   - 终界不必放到最大倍率才能看到结构，避免“看不到”的体验落差。

## Chunkbase 页面可直接观察到的证据（来自页面内容）

- **End City 弹窗**有 “Likely End City (with ship)” 与 **Completed** 勾选框。
- **Features 列表会随维度变化**：在 End 维度只出现 End City / End Gateway。
- **缩放提示机制**：页面说明“有些 features 需放大才会显示，并会提示与高亮”。
- **End 维度在较小缩放仍可点到结构**：当前 URL 中 zoom=0.213 仍可点开 End City 弹窗。
- **Credits 资讯来源**：
  - biome colors 来自 amidst
  - bedrockified 用于 Bedrock 支援
  - slime chunk 算法来源与移植者有明确列出

## 具体做法（草稿）

### 1) 不同维度对应正确结构

**做法**
- 建一份“维度 → 结构白名单”的对照表（版本维度亦可区分）。
- UI 的结构开关与地图渲染都必须读取这份表。

**验收**
- 切换到任一维度时，只显示该维度结构与相对应的筛选项。

### 2) 补齐结构资讯来源与内容

**做法**
- 盘点结构资讯来源（deepslate / vanilla datapacks / cubiomes 等）。
- 为缺失项补上生成判定或说明来源（例如 End City ship）。
- 结构弹窗补足关键字段（例如 ship、有无完成、是否可信等）。

**验收**
- End City 弹窗可显示 ship 相关资讯。
- 每个结构资讯有明确来源或可追溯说明。

### 3) 缩放显示机制优化（照 Chunkbase 的来）

**做法**
- 订立“结构类型 → 最小可见缩放”的规则，密度越高越晚出现。
- End 维度的主要结构在中等缩放即可显示，不必放到最大。
- 当缩放不足时提示用户，并高亮受影响的结构类型（与 Chunkbase 行为一致）。

**验收**
- End 维度在一般缩放就能看到主要结构。
- 有明确提示与高亮行为，符合 Chunkbase 逻辑。

## 简单对比（只列三项）

| 项目 | Chunkbase | MC Seed Marker | 备注 |
|---|---|---|---|
| 技术栈 | 页面可见 /_astro 资源路径（推测 Astro 构建） | Vue 3 + TS + Vite + Leaflet + WASM | 以目前专案为准 |
| 资讯来源 | Credits 明确提及 amidst、bedrockified、slime chunk 相关来源 | deepslate + vanilla datapacks + cubiomes | Chunkbase 其他来源需继续补证 |
