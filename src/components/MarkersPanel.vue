<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMarkersStore, type Marker } from '../stores/useMarkersStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useI18n } from 'vue-i18n'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const emit = defineEmits<{
  (e: 'goto', x: number, z: number): void
}>()

const markersStore = useMarkersStore()
const settingsStore = useSettingsStore()
const i18n = useI18n()

// 表單狀態
const newMarkerName = ref('')
const newMarkerX = ref<number | string>('')
const newMarkerZ = ref<number | string>('')
const newMarkerColor = ref('#22c55e')
const newMarkerIcon = ref('pin')

// 編輯狀態
const editingId = ref<string | null>(null)
const editName = ref('')
const editX = ref<number | string>('')
const editZ = ref<number | string>('')
const editColor = ref('')
const editIcon = ref('')

// 展開面板
const isExpanded = ref(false)
const showAddForm = ref(false)

// 監聽 seed 變化
watch(
  () => [settingsStore.seed, settingsStore.mc_version, settingsStore.dimension],
  () => {
    markersStore.setSeed(
      settingsStore.seed,
      settingsStore.mc_version,
      settingsStore.dimension.toString()
    )
  },
  { immediate: true }
)

// 新增標記
function addMarker() {
  const x = typeof newMarkerX.value === 'string' ? parseInt(newMarkerX.value) : newMarkerX.value
  const z = typeof newMarkerZ.value === 'string' ? parseInt(newMarkerZ.value) : newMarkerZ.value
  
  if (!newMarkerName.value.trim() || isNaN(x) || isNaN(z)) {
    return
  }
  
  markersStore.addMarker(
    newMarkerName.value.trim(),
    x,
    z,
    newMarkerColor.value,
    newMarkerIcon.value
  )
  
  // 清空表單
  newMarkerName.value = ''
  newMarkerX.value = ''
  newMarkerZ.value = ''
  showAddForm.value = false
}

// 開始編輯
function startEdit(marker: Marker) {
  editingId.value = marker.id
  editName.value = marker.name
  editX.value = marker.x
  editZ.value = marker.z
  editColor.value = marker.color
  editIcon.value = marker.icon
}

// 儲存編輯
function saveEdit() {
  if (!editingId.value) return
  
  const x = typeof editX.value === 'string' ? parseInt(editX.value) : editX.value
  const z = typeof editZ.value === 'string' ? parseInt(editZ.value) : editZ.value
  
  markersStore.updateMarker(editingId.value, {
    name: editName.value,
    x: isNaN(x) ? 0 : x,
    z: isNaN(z) ? 0 : z,
    color: editColor.value,
    icon: editIcon.value
  })
  
  editingId.value = null
}

// 取消編輯
function cancelEdit() {
  editingId.value = null
}

// 刪除標記
function deleteMarker(id: string) {
  markersStore.removeMarker(id)
}

// 跳轉到標記
function gotoMarker(marker: Marker) {
  emit('goto', marker.x, marker.z)
}

// 匯出標記
function exportMarkers() {
  const data = markersStore.exportMarkers()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `markers_${settingsStore.seed}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 匯入標記
function importMarkers(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    markersStore.importMarkers(content)
  }
  reader.readAsText(file)
  input.value = ''
}

// 取得圖示 class
function getIconClass(iconValue: string): string {
  const icon = markersStore.MARKER_ICONS.find(i => i.value === iconValue)
  return icon?.icon || 'fa-location-dot'
}

// 填入座標（從外部呼叫）
function fillCoordinates(x: number, z: number) {
  newMarkerX.value = Math.round(x)
  newMarkerZ.value = Math.round(z)
  showAddForm.value = true
}

defineExpose({ fillCoordinates })
</script>

<template>
  <div class="markers-panel">
    <div class="panel-header" @click="isExpanded = !isExpanded">
      <FontAwesomeIcon :icon="['fas', 'location-dot']" />
      <span>{{ i18n.t('markers.title', '自訂標記') }}</span>
      <span class="marker-count">({{ markersStore.markers.length }})</span>
      <FontAwesomeIcon 
        :icon="['fas', isExpanded ? 'chevron-up' : 'chevron-down']" 
        class="expand-icon"
      />
    </div>
    
    <div v-if="isExpanded" class="panel-content">
      <!-- 新增按鈕 -->
      <div class="action-buttons">
        <button class="btn btn-primary" @click="showAddForm = !showAddForm" :title="i18n.t('markers.add', '新增標記')">
          <FontAwesomeIcon :icon="['fas', 'plus']" />
        </button>
        <button class="btn btn-secondary" @click="exportMarkers" :disabled="markersStore.markers.length === 0">
          <FontAwesomeIcon :icon="['fas', 'download']" />
        </button>
        <label class="btn btn-secondary">
          <FontAwesomeIcon :icon="['fas', 'upload']" />
          <input type="file" accept=".json" @change="importMarkers" style="display: none" />
        </label>
      </div>
      
      <!-- 新增表單 -->
      <div v-if="showAddForm" class="add-form">
        <input 
          v-model="newMarkerName" 
          type="text" 
          :placeholder="i18n.t('markers.name_placeholder', '標記名稱')"
          class="input"
        />
        <div class="coord-row">
          <input 
            v-model="newMarkerX" 
            type="number" 
            placeholder="X"
            class="input coord-input"
          />
          <input 
            v-model="newMarkerZ" 
            type="number" 
            placeholder="Z"
            class="input coord-input"
          />
        </div>
        <div class="picker-row">
          <div class="color-picker">
            <button
              v-for="color in markersStore.MARKER_COLORS"
              :key="color.value"
              class="color-btn"
              :class="{ active: newMarkerColor === color.value }"
              :style="{ backgroundColor: color.value }"
              :title="color.name"
              @click="newMarkerColor = color.value"
            ></button>
          </div>
          <div class="icon-picker">
            <button
              v-for="icon in markersStore.MARKER_ICONS"
              :key="icon.value"
              class="icon-btn"
              :class="{ active: newMarkerIcon === icon.value }"
              :style="newMarkerIcon === icon.value ? { borderColor: newMarkerColor, backgroundColor: newMarkerColor + '33' } : {}"
              :title="icon.name"
              @click="newMarkerIcon = icon.value"
            >
              <FontAwesomeIcon :icon="['fas', icon.icon]" />
            </button>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-success" @click="addMarker">
            <FontAwesomeIcon :icon="['fas', 'check']" />
            {{ i18n.t('markers.confirm', '確認') }}
          </button>
          <button class="btn btn-secondary" @click="showAddForm = false">
            {{ i18n.t('markers.cancel', '取消') }}
          </button>
        </div>
      </div>
      
      <!-- 標記列表 -->
      <div class="markers-list">
        <div v-if="markersStore.markers.length === 0" class="empty-message">
          {{ i18n.t('markers.empty', '尚無標記，點擊地圖右鍵可快速新增') }}
        </div>
        
        <div 
          v-for="marker in markersStore.markers" 
          :key="marker.id" 
          class="marker-item"
        >
          <!-- 編輯模式 -->
          <template v-if="editingId === marker.id">
            <input v-model="editName" type="text" class="input edit-input" />
            <div class="coord-row">
              <input v-model="editX" type="number" class="input coord-input" />
              <input v-model="editZ" type="number" class="input coord-input" />
            </div>
            <div class="picker-row">
              <div class="color-picker">
                <button
                  v-for="color in markersStore.MARKER_COLORS"
                  :key="color.value"
                  class="color-btn"
                  :class="{ active: editColor === color.value }"
                  :style="{ backgroundColor: color.value }"
                  :title="color.name"
                  @click="editColor = color.value"
                ></button>
              </div>
              <div class="icon-picker">
                <button
                  v-for="icon in markersStore.MARKER_ICONS"
                  :key="icon.value"
                  class="icon-btn"
                  :class="{ active: editIcon === icon.value }"
                  :style="editIcon === icon.value ? { borderColor: editColor, backgroundColor: editColor + '33' } : {}"
                  :title="icon.name"
                  @click="editIcon = icon.value"
                >
                  <FontAwesomeIcon :icon="['fas', icon.icon]" />
                </button>
              </div>
            </div>
            <div class="edit-actions">
              <button class="btn btn-success btn-sm" @click="saveEdit">
                <FontAwesomeIcon :icon="['fas', 'check']" />
              </button>
              <button class="btn btn-secondary btn-sm" @click="cancelEdit">
                <FontAwesomeIcon :icon="['fas', 'times']" />
              </button>
            </div>
          </template>
          
          <!-- 顯示模式 -->
          <template v-else>
            <div class="marker-info" @click="gotoMarker(marker)">
              <span class="marker-icon" :style="{ color: marker.color }">
                <FontAwesomeIcon :icon="['fas', getIconClass(marker.icon)]" />
              </span>
              <span class="marker-name">{{ marker.name }}</span>
              <span class="marker-coords">{{ marker.x }}, {{ marker.z }}</span>
            </div>
            <div class="marker-actions">
              <button class="btn-icon" @click="startEdit(marker)" :title="i18n.t('markers.edit', '編輯')">
                <FontAwesomeIcon :icon="['fas', 'pen']" />
              </button>
              <button class="btn-icon btn-danger" @click="deleteMarker(marker.id)" :title="i18n.t('markers.delete', '刪除')">
                <FontAwesomeIcon :icon="['fas', 'trash']" />
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markers-panel {
  width: 220px;
  background-color: rgba(0, 0, 0, 0.8);
  border: 2px solid rgb(75, 85, 99);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  user-select: none;
  background-color: rgba(255, 255, 255, 0.05);
  font-family: var(--font-pixel, 'VT323', monospace);
  font-size: 1.125rem;
}

.panel-header:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.marker-count {
  opacity: 0.7;
  font-size: 0.875rem;
}

.expand-icon {
  margin-left: auto;
  opacity: 0.7;
}

.panel-content {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #22c55e;
  color: white;
  flex: 1;
}

.btn-primary:hover:not(:disabled) {
  background-color: #16a34a;
}

.btn-secondary {
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.2);
}

.btn-success {
  background-color: #22c55e;
  color: white;
}

.btn-success:hover {
  background-color: #16a34a;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
}

.input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.375rem;
  background-color: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #22c55e;
}

.coord-row {
  display: flex;
  gap: 0.5rem;
}

.coord-input {
  flex: 1;
}

.form-row {
  display: flex;
  gap: 0.5rem;
}

.form-row select {
  flex: 1;
}

.picker-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-picker,
.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.color-btn {
  width: 22px;
  height: 22px;
  border: 2px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: white;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.15s;
}

.icon-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.icon-btn.active {
  /* border-color and background-color set via inline style */
}

.form-actions {
  display: flex;
  gap: 0.5rem;
}

.form-actions .btn {
  flex: 1;
}

.markers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.markers-list::-webkit-scrollbar {
  width: 4px;
}

.markers-list::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.empty-message {
  text-align: center;
  padding: 1rem;
  opacity: 0.7;
  font-size: 0.875rem;
}

.marker-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
}

.marker-item:not(:has(.edit-input)) {
  flex-direction: row;
  align-items: center;
}

.marker-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}

.marker-info:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.marker-icon {
  font-size: 1rem;
}

.marker-name {
  flex: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marker-coords {
  font-size: 0.75rem;
  opacity: 0.7;
  font-family: monospace;
}

.marker-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.25rem;
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.btn-icon.btn-danger:hover {
  background-color: #ef4444;
}

.edit-input {
  width: 100%;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
