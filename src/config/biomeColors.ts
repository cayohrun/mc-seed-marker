/**
 * 柔和調色盤 - 參考 mcseedmap.net 風格
 * 降低飽和度，使用更自然的色調
 */

export const SOFT_BIOME_COLORS: Record<string, { r: number; g: number; b: number }> = {
  // === 海洋 ===
  'minecraft:deep_frozen_ocean': { r: 62, g: 100, b: 132 },
  'minecraft:deep_cold_ocean': { r: 45, g: 85, b: 120 },
  'minecraft:deep_ocean': { r: 35, g: 65, b: 115 },
  'minecraft:deep_lukewarm_ocean': { r: 50, g: 90, b: 130 },
  'minecraft:frozen_ocean': { r: 82, g: 145, b: 185 },
  'minecraft:cold_ocean': { r: 70, g: 125, b: 170 },
  'minecraft:ocean': { r: 60, g: 105, b: 160 },
  'minecraft:warm_ocean': { r: 75, g: 140, b: 175 },
  'minecraft:lukewarm_ocean': { r: 70, g: 130, b: 170 },

  // === 河流 ===
  'minecraft:frozen_river': { r: 140, g: 180, b: 210 },
  'minecraft:river': { r: 85, g: 130, b: 180 },

  // === 沼澤 ===
  'minecraft:swamp': { r: 85, g: 140, b: 110 },
  'minecraft:mangrove_swamp': { r: 55, g: 95, b: 75 },

  // === 雪地 ===
  'minecraft:snowy_plains': { r: 235, g: 240, b: 245 },
  'minecraft:ice_spikes': { r: 185, g: 215, b: 235 },
  'minecraft:snowy_taiga': { r: 175, g: 200, b: 180 },
  'minecraft:snowy_slopes': { r: 170, g: 195, b: 215 },
  'minecraft:snowy_beach': { r: 195, g: 200, b: 170 },
  'minecraft:frozen_peaks': { r: 210, g: 215, b: 220 },

  // === 平原 ===
  'minecraft:plains': { r: 141, g: 179, b: 96 },
  'minecraft:sunflower_plains': { r: 155, g: 190, b: 85 },
  'minecraft:meadow': { r: 165, g: 195, b: 95 },

  // === 森林 ===
  'minecraft:forest': { r: 86, g: 140, b: 70 },
  'minecraft:flower_forest': { r: 105, g: 155, b: 75 },
  'minecraft:birch_forest': { r: 115, g: 165, b: 100 },
  'minecraft:old_growth_birch_forest': { r: 100, g: 170, b: 95 },
  'minecraft:dark_forest': { r: 55, g: 95, b: 55 },
  'minecraft:windswept_forest': { r: 75, g: 120, b: 90 },

  // === 針葉林 ===
  'minecraft:taiga': { r: 75, g: 110, b: 60 },
  'minecraft:old_growth_spruce_taiga': { r: 60, g: 85, b: 50 },
  'minecraft:old_growth_pine_taiga': { r: 70, g: 90, b: 45 },
  'minecraft:grove': { r: 145, g: 160, b: 175 },

  // === 草原 ===
  'minecraft:savanna': { r: 155, g: 180, b: 90 },
  'minecraft:savanna_plateau': { r: 135, g: 160, b: 75 },
  'minecraft:windswept_savanna': { r: 150, g: 175, b: 95 },

  // === 叢林 ===
  'minecraft:jungle': { r: 80, g: 160, b: 65 },
  'minecraft:sparse_jungle': { r: 110, g: 170, b: 70 },
  'minecraft:bamboo_jungle': { r: 90, g: 165, b: 85 },

  // === 惡地 ===
  'minecraft:badlands': { r: 195, g: 120, b: 60 },
  'minecraft:eroded_badlands': { r: 175, g: 100, b: 50 },
  'minecraft:wooded_badlands': { r: 180, g: 130, b: 55 },

  // === 海灘和岩岸 ===
  'minecraft:beach': { r: 220, g: 210, b: 150 },
  'minecraft:stony_shore': { r: 115, g: 115, b: 110 },

  // === 沙漠 ===
  'minecraft:desert': { r: 215, g: 200, b: 130 },

  // === 山地 ===
  'minecraft:windswept_hills': { r: 115, g: 135, b: 130 },
  'minecraft:windswept_gravelly_hills': { r: 125, g: 140, b: 135 },
  'minecraft:jagged_peaks': { r: 185, g: 175, b: 185 },
  'minecraft:stony_peaks': { r: 160, g: 170, b: 180 },

  // === 特殊 ===
  'minecraft:mushroom_fields': { r: 200, g: 145, b: 195 },
  'minecraft:cherry_grove': { r: 195, g: 145, b: 190 },
  'minecraft:pale_garden': { r: 155, g: 160, b: 155 },
  'minecraft:deep_dark': { r: 25, g: 40, b: 35 },
  'minecraft:lush_caves': { r: 100, g: 175, b: 85 },
  'minecraft:dripstone_caves': { r: 130, g: 115, b: 75 },

  // === 地獄 ===
  'minecraft:nether_wastes': { r: 145, g: 75, b: 70 },
  'minecraft:soul_sand_valley': { r: 125, g: 115, b: 100 },
  'minecraft:crimson_forest': { r: 175, g: 70, b: 60 },
  'minecraft:warped_forest': { r: 75, g: 140, b: 135 },
  'minecraft:basalt_deltas': { r: 85, g: 80, b: 75 },

  // === 乙太 ===
  'minecraft:the_end': { r: 200, g: 195, b: 130 },
  'minecraft:small_end_islands': { r: 190, g: 195, b: 100 },
  'minecraft:end_midlands': { r: 155, g: 160, b: 80 },
  'minecraft:end_highlands': { r: 115, g: 120, b: 65 },
  'minecraft:end_barrens': { r: 175, g: 180, b: 135 },
  'minecraft:the_void': { r: 15, g: 15, b: 20 },
}

/**
 * 檢查是否有自定義柔和色
 */
export function getSoftBiomeColor(biomeId: string): { r: number; g: number; b: number } | undefined {
  return SOFT_BIOME_COLORS[biomeId]
}
