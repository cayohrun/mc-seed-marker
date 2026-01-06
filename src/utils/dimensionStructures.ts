/**
 * 維度對應結構白名單
 * 用於過濾結構列表，確保只顯示當前維度的結構
 */

export const DIMENSION_STRUCTURES = {
  'minecraft:overworld': [
    'minecraft:village_plains',
    'minecraft:village_desert',
    'minecraft:village_savanna',
    'minecraft:village_snowy',
    'minecraft:village_taiga',
    'minecraft:stronghold',
    'minecraft:monument',
    'minecraft:mansion',
    'minecraft:mineshaft',
    'minecraft:mineshaft_mesa',
    'minecraft:buried_treasure',
    'minecraft:shipwreck',
    'minecraft:shipwreck_beached',
    'minecraft:ocean_ruin_cold',
    'minecraft:ocean_ruin_warm',
    'minecraft:jungle_pyramid',
    'minecraft:desert_pyramid',
    'minecraft:swamp_hut',
    'minecraft:igloo',
    'minecraft:pillager_outpost',
    'minecraft:ancient_city',
    'minecraft:ruined_portal',
    'minecraft:ruined_portal_desert',
    'minecraft:ruined_portal_jungle',
    'minecraft:ruined_portal_swamp',
    'minecraft:ruined_portal_ocean',
    'minecraft:ruined_portal_mountain',
    'minecraft:trail_ruins',
    'minecraft:trial_chambers'
  ],
  'minecraft:the_nether': [
    'minecraft:fortress',
    'minecraft:bastion_remnant',
    'minecraft:ruined_portal_nether'
  ],
  'minecraft:the_end': [
    'minecraft:end_city',
    'minecraft:end_gateway'
  ]
} as const

export type DimensionId = keyof typeof DIMENSION_STRUCTURES

/**
 * 檢查結構是否屬於指定維度
 * @param structureId 結構 ID（完整格式如 minecraft:end_city）
 * @param dimensionId 維度 ID（完整格式如 minecraft:overworld）
 * @returns 如果結構屬於該維度則回傳 true，未知維度時回傳 true（寬鬆策略）
 */
export function isStructureInDimension(structureId: string, dimensionId: string): boolean {
  const list = DIMENSION_STRUCTURES[dimensionId as DimensionId]
  if (!list) return true // 未知維度時寬鬆處理
  // 必須完全相等，不用 includes 避免 ruined_portal_nether 匹配 ruined_portal
  return list.some(s => s === structureId)
}
