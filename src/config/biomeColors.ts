/**
 * mcseedmap.net 精確顏色表
 * 從 mcseedmap.net JS bundle 提取的生態系顏色
 * 格式：十進制 color -> RGB { r, g, b }
 */

// 輔助函數：將十進制顏色轉換為 RGB
function decToRgb(dec: number): { r: number; g: number; b: number } {
  return {
    r: (dec >> 16) & 0xff,
    g: (dec >> 8) & 0xff,
    b: dec & 0xff
  }
}

// mcseedmap.net 原始顏色（十進制）
const MCSEEDMAP_COLORS: Record<string, number> = {
  // === 海洋 ===
  'minecraft:ocean': 112,                    // 0x000070
  'minecraft:deep_ocean': 48,                // 0x000030
  'minecraft:frozen_ocean': 7368918,         // 0x7070D6
  'minecraft:deep_frozen_ocean': 4210832,    // 0x404090
  'minecraft:cold_ocean': 2105456,           // 0x202070
  'minecraft:deep_cold_ocean': 2105400,      // 0x202038
  'minecraft:lukewarm_ocean': 144,           // 0x000090
  'minecraft:deep_lukewarm_ocean': 64,       // 0x000040
  'minecraft:warm_ocean': 172,               // 0x0000AC

  // === 河流 ===
  'minecraft:river': 255,                    // 0x0000FF
  'minecraft:frozen_river': 10526975,        // 0xA0A0FF

  // === 沼澤 ===
  'minecraft:swamp': 522674,                 // 0x07F9B2
  'minecraft:mangrove_swamp': 2935950,       // 0x2CCC8E

  // === 雪地/冰原 ===
  'minecraft:snowy_plains': 16777215,        // 0xFFFFFF
  'minecraft:ice_spikes': 11853020,          // 0xB4DCDC
  'minecraft:snowy_taiga': 3233098,          // 0x31554A
  'minecraft:snowy_slopes': 12895428,        // 0xC4C4C4
  'minecraft:snowy_beach': 16445632,         // 0xFAF0C0
  'minecraft:frozen_peaks': 11580366,        // 0xB0C8CE

  // === 平原 ===
  'minecraft:plains': 9286496,               // 0x8DB360
  'minecraft:sunflower_plains': 11918216,    // 0xB5DB88
  'minecraft:meadow': 6333509,               // 0x60A555

  // === 森林 ===
  'minecraft:forest': 353825,                // 0x056621
  'minecraft:flower_forest': 2985545,        // 0x2D8A49
  'minecraft:birch_forest': 3175492,         // 0x307444
  'minecraft:old_growth_birch_forest': 5807212, // 0x58936C
  'minecraft:dark_forest': 4215066,          // 0x40511A
  'minecraft:windswept_forest': 5993298,     // 0x5B7352

  // === 針葉林 ===
  'minecraft:taiga': 748127,                 // 0x0B6659
  'minecraft:old_growth_spruce_taiga': 8490617, // 0x818E79
  'minecraft:old_growth_pine_taiga': 5858897, // 0x596651
  'minecraft:grove': 4682348,                // 0x476B4C

  // === 草原 ===
  'minecraft:savanna': 12431967,             // 0xBDB25F
  'minecraft:savanna_plateau': 10984804,     // 0xA79D64
  'minecraft:windswept_savanna': 15063687,   // 0xE5DA87

  // === 叢林 ===
  'minecraft:jungle': 5274378,               // 0x507B0A
  'minecraft:sparse_jungle': 6329103,        // 0x608B0F
  'minecraft:bamboo_jungle': 8688896,        // 0x849400

  // === 惡地 ===
  'minecraft:badlands': 14238997,            // 0xD94515
  'minecraft:eroded_badlands': 16739645,     // 0xFF6D3D
  'minecraft:wooded_badlands': 13274213,     // 0xCA8C65

  // === 海灘和岩岸 ===
  'minecraft:beach': 16440917,               // 0xFADE55
  'minecraft:stony_shore': 10658436,         // 0xA2A284

  // === 沙漠 ===
  'minecraft:desert': 16421912,              // 0xFA9418

  // === 山地 ===
  'minecraft:windswept_hills': 6316128,      // 0x606060
  'minecraft:windswept_gravelly_hills': 8947848, // 0x888888
  'minecraft:jagged_peaks': 14474440,        // 0xDCDCD8
  'minecraft:stony_peaks': 8097652,          // 0x7B9594

  // === 特殊 ===
  'minecraft:mushroom_fields': 16711935,     // 0xFF00FF
  'minecraft:cherry_grove': 16749600,        // 0xFFC1E0
  'minecraft:pale_garden': 6909333,          // 0x696A85
  'minecraft:deep_dark': 204585,             // 0x031F39
  'minecraft:lush_caves': 2636800,           // 0x283800
  'minecraft:dripstone_caves': 5124114,      // 0x4E3F32

  // === 地獄 ===
  'minecraft:nether_wastes': 5711142,        // 0x572526
  'minecraft:soul_sand_valley': 5061166,     // 0x4D3B2E
  'minecraft:crimson_forest': 9968145,       // 0x981A11
  'minecraft:warped_forest': 4821115,        // 0x49907B
  'minecraft:basalt_deltas': 6578019,        // 0x645F63

  // === 乙太 ===
  'minecraft:the_end': 8421631,              // 0x8080FF
  'minecraft:small_end_islands': 4934571,    // 0x4B4BAB
  'minecraft:end_midlands': 13224281,        // 0xC9C459
  'minecraft:end_highlands': 11908406,       // 0xB5DA36
  'minecraft:end_barrens': 7368908,          // 0x7070CC
  'minecraft:the_void': 0,                   // 0x000000

  // === 已棄用（1.18前）===
  'minecraft:snowy_mountains': 10526880,
  'minecraft:mushroom_field_shore': 10486015,
  'minecraft:desert_hills': 13786898,
  'minecraft:wooded_hills': 2250012,
  'minecraft:taiga_hills': 1456435,
  'minecraft:mountain_edge': 7501978,
  'minecraft:jungle_hills': 2900485,
  'minecraft:birch_forest_hills': 2055986,
  'minecraft:snowy_taiga_hills': 2375478,
  'minecraft:giant_tree_taiga_hills': 4542270,
  'minecraft:badlands_plateau': 11573093,
  'minecraft:deep_warm_ocean': 80,
  'minecraft:desert_lakes': 16759872,
  'minecraft:taiga_mountains': 3379847,
  'minecraft:swamp_hills': 3145690,
  'minecraft:modified_jungle': 7906098,
  'minecraft:modified_jungle_edge': 8960823,
  'minecraft:tall_birch_hills': 4687706,
  'minecraft:dark_forest_hills': 6846786,
  'minecraft:snowy_taiga_mountains': 5864818,
  'minecraft:giant_spruce_taiga_hills': 7173990,
  'minecraft:modified_gravelly_mountains': 8625018,
  'minecraft:shattered_savanna_plateau': 13616524,
  'minecraft:modified_wooded_badlands_plateau': 14204813,
  'minecraft:modified_badlands_plateau': 15905933,
  'minecraft:bamboo_jungle_hills': 6056964,
}

/**
 * 轉換後的 RGB 顏色表
 */
export const MCSEEDMAP_BIOME_COLORS: Record<string, { r: number; g: number; b: number }> = {}

// 初始化顏色表
for (const [biome, color] of Object.entries(MCSEEDMAP_COLORS)) {
  MCSEEDMAP_BIOME_COLORS[biome] = decToRgb(color)
}

/**
 * 柔和調色盤 - 用於備選（降低飽和度版本）
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
 * 獲取 mcseedmap 精確顏色
 */
export function getMcseedmapBiomeColor(biomeId: string): { r: number; g: number; b: number } | undefined {
  return MCSEEDMAP_BIOME_COLORS[biomeId]
}

/**
 * 獲取柔和版顏色
 */
export function getSoftBiomeColor(biomeId: string): { r: number; g: number; b: number } | undefined {
  return SOFT_BIOME_COLORS[biomeId]
}
