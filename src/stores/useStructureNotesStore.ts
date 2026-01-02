import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { get, set } from 'idb-keyval'

export interface StructureNote {
  note: string
  customIcon?: string  // 自定義圖示 (minecraft item path)
  updatedAt: number
}

export interface StructureNotesData {
  // key 格式: seedKey_structureId_x_z
  [key: string]: StructureNote
}

export interface CustomStructureIcons {
  // key 格式: structureId (e.g., "minecraft:village_plains")
  [structureId: string]: string  // minecraft item path
}

const NOTES_STORAGE_KEY = 'mc-structure-notes'
const ICONS_STORAGE_KEY = 'mc-custom-structure-icons'

// 預設結構圖示映射 - 使用本地 webp 圖示 (來自 mcseedmap.net 授權)
// 結構 ID 必須與 datapack 中的名稱完全匹配
export const DEFAULT_STRUCTURE_ICONS: { [key: string]: string } = {
  // 村莊
  'minecraft:village_plains': '/structure-icons/village.webp',
  'minecraft:village_desert': '/structure-icons/village.webp',
  'minecraft:village_savanna': '/structure-icons/village.webp',
  'minecraft:village_snowy': '/structure-icons/village.webp',
  'minecraft:village_taiga': '/structure-icons/village.webp',

  // 主世界結構
  'minecraft:pillager_outpost': '/structure-icons/outpost.webp',
  'minecraft:mansion': '/structure-icons/mansion.webp',
  'minecraft:monument': '/structure-icons/monument.webp',
  'minecraft:stronghold': '/structure-icons/stronghold.webp',
  'minecraft:mineshaft': '/structure-icons/mineshaft.webp',
  'minecraft:mineshaft_mesa': '/structure-icons/mineshaft.webp',
  'minecraft:buried_treasure': '/structure-icons/treasure.webp',
  'minecraft:shipwreck': '/structure-icons/shipwreck.webp',
  'minecraft:shipwreck_beached': '/structure-icons/shipwreck.webp',
  'minecraft:ocean_ruin_cold': '/structure-icons/oceanruin.webp',
  'minecraft:ocean_ruin_warm': '/structure-icons/oceanruin.webp',

  // 廢棄傳送門
  'minecraft:ruined_portal': '/structure-icons/ruinedportal.webp',
  'minecraft:ruined_portal_desert': '/structure-icons/ruinedportal.webp',
  'minecraft:ruined_portal_jungle': '/structure-icons/ruinedportal.webp',
  'minecraft:ruined_portal_mountain': '/structure-icons/ruinedportal.webp',
  'minecraft:ruined_portal_nether': '/structure-icons/ruinedportal.webp',
  'minecraft:ruined_portal_ocean': '/structure-icons/ruinedportal.webp',
  'minecraft:ruined_portal_swamp': '/structure-icons/ruinedportal.webp',

  // 神殿和遺跡
  'minecraft:desert_pyramid': '/structure-icons/desertpyramid.webp',
  'minecraft:jungle_pyramid': '/structure-icons/junglepyramid.webp',
  'minecraft:swamp_hut': '/structure-icons/swamphut.webp',
  'minecraft:igloo': '/structure-icons/igloo.webp',
  'minecraft:ancient_city': '/structure-icons/ancientcity.webp',
  'minecraft:trail_ruins': '/structure-icons/trailruin.webp',
  'minecraft:trial_chambers': '/structure-icons/trialchambers.webp',

  // 紫水晶洞
  'minecraft:amethyst_geode': '/structure-icons/geode.png',
}

// 可選的圖示列表（供用戶選擇）- 使用本地 webp 圖示
export const AVAILABLE_STRUCTURE_ICONS = [
  { name: '村莊', value: '/structure-icons/village.webp' },
  { name: '沙漠神殿', value: '/structure-icons/desertpyramid.webp' },
  { name: '叢林神殿', value: '/structure-icons/junglepyramid.webp' },
  { name: '海底神殿', value: '/structure-icons/monument.webp' },
  { name: '林地府邸', value: '/structure-icons/mansion.webp' },
  { name: '掠奪者前哨站', value: '/structure-icons/outpost.webp' },
  { name: '要塞', value: '/structure-icons/stronghold.webp' },
  { name: '廢棄礦坑', value: '/structure-icons/mineshaft.webp' },
  { name: '沉船', value: '/structure-icons/shipwreck.webp' },
  { name: '埋藏的寶藏', value: '/structure-icons/treasure.webp' },
  { name: '廢棄傳送門', value: '/structure-icons/ruinedportal.webp' },
  { name: '女巫小屋', value: '/structure-icons/swamphut.webp' },
  { name: '冰屋', value: '/structure-icons/igloo.webp' },
  { name: '遠古城市', value: '/structure-icons/ancientcity.webp' },
  { name: '古蹟廢墟', value: '/structure-icons/trailruin.webp' },
  { name: '試煉密室', value: '/structure-icons/trialchambers.webp' },
  { name: '海底遺跡', value: '/structure-icons/oceanruin.webp' },
  { name: '紫水晶洞', value: '/structure-icons/geode.png' },
]

export const useStructureNotesStore = defineStore('structureNotes', () => {
  const notes = ref<StructureNotesData>({})
  const customIcons = ref<CustomStructureIcons>({})
  const currentSeedKey = ref<string>('')
  const isLoaded = ref(false)

  // 從 IndexedDB 載入資料
  async function loadData() {
    try {
      const notesData = await get<StructureNotesData>(NOTES_STORAGE_KEY)
      const iconsData = await get<CustomStructureIcons>(ICONS_STORAGE_KEY)

      if (notesData) {
        notes.value = notesData
      }
      if (iconsData) {
        customIcons.value = iconsData
      }
      isLoaded.value = true
    } catch (e) {
      console.error('Failed to load structure notes:', e)
      isLoaded.value = true
    }
  }

  // 儲存到 IndexedDB
  async function saveNotes() {
    try {
      await set(NOTES_STORAGE_KEY, notes.value)
    } catch (e) {
      console.error('Failed to save structure notes:', e)
    }
  }

  async function saveIcons() {
    try {
      await set(ICONS_STORAGE_KEY, customIcons.value)
    } catch (e) {
      console.error('Failed to save custom icons:', e)
    }
  }

  // 設定當前 seed
  function setSeedKey(seedKey: string) {
    currentSeedKey.value = seedKey
  }

  // 生成結構位置的唯一 key
  function getStructureKey(structureId: string, x: number, z: number): string {
    return `${currentSeedKey.value}_${structureId}_${x}_${z}`
  }

  // 獲取結構備註
  function getNote(structureId: string, x: number, z: number): StructureNote | undefined {
    const key = getStructureKey(structureId, x, z)
    return notes.value[key]
  }

  // 設定結構備註
  function setNote(structureId: string, x: number, z: number, note: string, customIcon?: string) {
    const key = getStructureKey(structureId, x, z)
    notes.value[key] = {
      note,
      customIcon,
      updatedAt: Date.now()
    }
    saveNotes()
  }

  // 刪除結構備註
  function removeNote(structureId: string, x: number, z: number) {
    const key = getStructureKey(structureId, x, z)
    delete notes.value[key]
    saveNotes()
  }

  // 獲取結構圖示（優先級：位置自定義 > 結構類型自定義 > 預設映射 > 隨機）
  function getStructureIcon(structureId: string, x?: number, z?: number): string | undefined {
    // 1. 檢查此位置是否有自定義圖示
    if (x !== undefined && z !== undefined) {
      const note = getNote(structureId, x, z)
      if (note?.customIcon) {
        return note.customIcon
      }
    }

    // 2. 檢查結構類型是否有自定義圖示
    if (customIcons.value[structureId]) {
      return customIcons.value[structureId]
    }

    // 3. 使用預設映射
    if (DEFAULT_STRUCTURE_ICONS[structureId]) {
      return DEFAULT_STRUCTURE_ICONS[structureId]
    }

    // 4. 返回 undefined，讓調用者使用隨機圖示
    return undefined
  }

  // 設定結構類型的自定義圖示
  function setStructureTypeIcon(structureId: string, iconPath: string) {
    customIcons.value[structureId] = iconPath
    saveIcons()
  }

  // 重置結構類型的圖示為預設
  function resetStructureTypeIcon(structureId: string) {
    delete customIcons.value[structureId]
    saveIcons()
  }

  // 初始化載入
  loadData()

  return {
    notes,
    customIcons,
    currentSeedKey,
    isLoaded,
    DEFAULT_STRUCTURE_ICONS,
    AVAILABLE_STRUCTURE_ICONS,
    setSeedKey,
    getNote,
    setNote,
    removeNote,
    getStructureIcon,
    setStructureTypeIcon,
    resetStructureTypeIcon
  }
})
