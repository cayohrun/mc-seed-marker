import { defineStore } from 'pinia'
import { ref, watch, toRaw } from 'vue'
import { get, set } from 'idb-keyval'

export interface Marker {
  id: string
  name: string
  x: number
  z: number
  color: string
  icon: string
  createdAt: number
}

export interface MarkersData {
  [seedKey: string]: Marker[]
}

const STORAGE_KEY = 'mc-seed-markers'

const MARKER_COLORS = [
  { name: '紅色', nameEn: 'Red', value: '#ef4444' },
  { name: '綠色', nameEn: 'Green', value: '#22c55e' },
  { name: '藍色', nameEn: 'Blue', value: '#3b82f6' },
  { name: '黃色', nameEn: 'Yellow', value: '#eab308' },
  { name: '紫色', nameEn: 'Purple', value: '#a855f7' },
  { name: '橙色', nameEn: 'Orange', value: '#f97316' },
  { name: '青色', nameEn: 'Cyan', value: '#06b6d4' },
  { name: '粉色', nameEn: 'Pink', value: '#ec4899' },
]

const MARKER_ICONS = [
  { name: '家', nameEn: 'Home', value: 'home', icon: 'fa-house' },
  { name: '農場', nameEn: 'Farm', value: 'farm', icon: 'fa-wheat-awn' },
  { name: '礦場', nameEn: 'Mine', value: 'mine', icon: 'fa-gem' },
  { name: '村莊', nameEn: 'Village', value: 'village', icon: 'fa-building' },
  { name: '要塞', nameEn: 'Fortress', value: 'fortress', icon: 'fa-chess-rook' },
  { name: '神殿', nameEn: 'Temple', value: 'temple', icon: 'fa-landmark' },
  { name: '傳送門', nameEn: 'Portal', value: 'portal', icon: 'fa-door-open' },
  { name: '標記', nameEn: 'Pin', value: 'pin', icon: 'fa-location-dot' },
]

export const useMarkersStore = defineStore('markers', () => {
  const markers = ref<Marker[]>([])
  const allMarkersData = ref<MarkersData>({})
  const currentSeedKey = ref<string>('')
  const isLoaded = ref(false)

  // 從 IndexedDB 載入資料
  async function loadMarkers() {
    try {
      const data = await get<MarkersData>(STORAGE_KEY)
      if (data) {
        allMarkersData.value = data
      }
      isLoaded.value = true
    } catch (e) {
      console.error('Failed to load markers:', e)
      isLoaded.value = true
    }
  }

  // 儲存到 IndexedDB
  async function saveMarkers() {
    try {
      // 使用 toRaw 移除 Vue Proxy，否則 IndexedDB 無法序列化
      const rawData = JSON.parse(JSON.stringify(toRaw(allMarkersData.value)))
      await set(STORAGE_KEY, rawData)
    } catch (e) {
      console.error('Failed to save markers:', e)
    }
  }

  // 設定當前 seed
  function setSeed(seed: bigint, version: string, dimension: string) {
    const key = `${seed.toString()}_${version}_${dimension}`
    currentSeedKey.value = key

    // 如果資料還沒載完，等載完再讀
    if (!isLoaded.value) {
      loadMarkers().then(() => {
        if (currentSeedKey.value === key) {
          markers.value = allMarkersData.value[key] || []
        }
      })
      return
    }

    markers.value = allMarkersData.value[key] || []
  }

  // 新增標記
  function addMarker(name: string, x: number, z: number, color: string = '#22c55e', icon: string = 'pin') {
    const marker: Marker = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      x: Math.round(x),
      z: Math.round(z),
      color,
      icon,
      createdAt: Date.now()
    }
    
    markers.value.push(marker)
    allMarkersData.value[currentSeedKey.value] = markers.value
    saveMarkers()
    
    return marker
  }

  // 更新標記
  function updateMarker(id: string, updates: Partial<Marker>) {
    const index = markers.value.findIndex(m => m.id === id)
    if (index !== -1) {
      markers.value[index] = { ...markers.value[index], ...updates }
      allMarkersData.value[currentSeedKey.value] = markers.value
      saveMarkers()
    }
  }

  // 刪除標記
  function removeMarker(id: string) {
    markers.value = markers.value.filter(m => m.id !== id)
    allMarkersData.value[currentSeedKey.value] = markers.value
    saveMarkers()
  }

  // 匯出標記
  function exportMarkers(): string {
    return JSON.stringify({
      seedKey: currentSeedKey.value,
      markers: markers.value,
      exportedAt: new Date().toISOString()
    }, null, 2)
  }

  // 匯入標記
  function importMarkers(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString)
      if (data.markers && Array.isArray(data.markers)) {
        // 合併標記，避免重複
        const existingIds = new Set(markers.value.map(m => m.id))
        const newMarkers = data.markers.filter((m: Marker) => !existingIds.has(m.id))
        markers.value = [...markers.value, ...newMarkers]
        allMarkersData.value[currentSeedKey.value] = markers.value
        saveMarkers()
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to import markers:', e)
      return false
    }
  }

  // 初始化載入
  loadMarkers()

  return {
    markers,
    currentSeedKey,
    isLoaded,
    MARKER_COLORS,
    MARKER_ICONS,
    setSeed,
    addMarker,
    updateMarker,
    removeMarker,
    exportMarkers,
    importMarkers
  }
})
