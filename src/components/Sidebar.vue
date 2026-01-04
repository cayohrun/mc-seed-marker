<script setup lang="ts">
import { Datapack } from 'mc-datapack-loader';
import { ref, computed } from 'vue';
import { Identifier, XoroshiroRandom, WorldgenStructure, WorldgenRegistries } from 'deepslate';
import { useDatapackStore } from '../stores/useDatapackStore';
import { useRecentStore } from '../stores/useRecentStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useSearchStore } from '../stores/useBiomeSearchStore';
import { useLoadedDimensionStore } from '../stores/useLoadedDimensionStore';
import { versionMetadata, parseSeed } from '../util';
import Footer from './Footer.vue';
import OpenDropdown from './dropdown/OpenDropdown.vue';
import { vOnClickOutside } from '@vueuse/components';
import { EventTracker } from '../util/EventTracker';
import { useI18n } from 'vue-i18n';


const i18n = useI18n()
const datapackStore = useDatapackStore()
const settingsStore = useSettingsStore()
const recentStore = useRecentStore()
const searchStore = useSearchStore()
const loadedDimensionStore = useLoadedDimensionStore()

const file_dragging = ref(false)
const random = XoroshiroRandom.create(BigInt(Date.now()))

// Dropdown 狀態
const biomeDropdownOpen = ref(false)
const structureDropdownOpen = ref(false)
const openDropdownOpen = ref(false)

// 生態系搜尋輸入
const biomeSearchInput = ref('')

// Map Layers 狀態
const showSlimeChunks = ref(false)

// 結構列表
const availableStructures = computed(() => {
  return [...WorldgenStructure.REGISTRY.keys()]
    .filter(id => !loadedDimensionStore.loaded_dimension.hidden_structures?.has(id.toString()))
    .map(id => ({
      id: id.toString(),
      name: settingsStore.getLocalizedName('structure', id, false)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const allStructuresSelected = computed(() => {
  return availableStructures.value.length > 0 &&
    availableStructures.value.every(s => searchStore.structures.has(s.id))
})

function toggleAllStructures() {
  if (allStructuresSelected.value) {
    searchStore.structures.clear()
  } else {
    availableStructures.value.forEach(s => searchStore.structures.add(s.id))
  }
  searchStore.$patch({})
}

function toggleStructure(id: string) {
  if (searchStore.structures.has(id)) {
    searchStore.structures.delete(id)
  } else {
    searchStore.structures.add(id)
  }
  searchStore.$patch({})
}

// Biome 列表
const availableBiomes = computed(() => {
  return [...WorldgenRegistries.BIOME.keys()]
    .map(id => {
      const color = loadedDimensionStore.getBiomeColor(id.toString())
      return {
        id: id.toString(),
        name: settingsStore.getLocalizedName('biome', id, false),
        color: `rgb(${color.r}, ${color.g}, ${color.b})`
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredBiomes = computed(() => {
  if (!biomeSearchInput.value) return availableBiomes.value
  const search = biomeSearchInput.value.toLowerCase()
  return availableBiomes.value.filter(b =>
    b.name.toLowerCase().includes(search) || b.id.toLowerCase().includes(search)
  )
})

const allBiomesSelected = computed(() => {
  return filteredBiomes.value.length > 0 &&
    filteredBiomes.value.every(b => searchStore.biomes.has(b.id))
})

function toggleAllBiomes() {
  if (allBiomesSelected.value) {
    filteredBiomes.value.forEach(b => searchStore.biomes.delete(b.id))
  } else {
    filteredBiomes.value.forEach(b => searchStore.biomes.add(b.id))
  }
  searchStore.$patch({ disabled: false })
}

function toggleBiome(id: string) {
  if (searchStore.biomes.has(id)) {
    searchStore.biomes.delete(id)
  } else {
    searchStore.biomes.add(id)
  }
  searchStore.$patch({ disabled: false })
}

function randomizeSeed() {
  settingsStore.seed = random.nextLong()
}

// Datapack 拖放處理
async function dropHandler(ev: DragEvent) {
  if (ev.dataTransfer === null) {
    return
  }
  ev.preventDefault()
  file_dragging.value = false

  const datapackVersion = versionMetadata[settingsStore.mc_version].datapackFormat

  for (const item of ev.dataTransfer.items) {
    if ("getAsFileSystemHandle" in item) {
      const handle = await item.getAsFileSystemHandle()
      var datapack: Datapack
      if (handle instanceof FileSystemDirectoryHandle) {
        EventTracker.track(`add_datapack/folder/drag_and_drop`)
        datapack = Datapack.fromFileSystemDirectoryHandle(handle, datapackVersion)
        datapackStore.addDatapack(datapack)
        recentStore.addRecentFileHandle(handle, datapack)
      } else if (handle instanceof FileSystemFileHandle) {
        EventTracker.track(`add_datapack/zip/drag_and_drop`)
        const file = await handle.getFile()
        datapack = Datapack.fromZipFile(file, datapackVersion)
        datapackStore.addDatapack(datapack)
        recentStore.storeAndAddRecent(file, datapack)
      }
    } else {
      if (["application/zip", 'application/java-archive', 'application/x-java-archive'].includes((item as DataTransferItem).type)) {
        const file = (item as DataTransferItem).getAsFile()
        if (file) {
          EventTracker.track(`add_datapack/zip/drag_and_drop`)
          const datapack = Datapack.fromZipFile(file, datapackVersion)
          datapackStore.addDatapack(datapack)
          recentStore.storeAndAddRecent(file, datapack)
        }
      }
    }
  }
}

function dragOverHandler(ev: DragEvent) {
  ev.preventDefault()
}
</script>

<template>
  <aside
    class="w-80 bg-surface-dark border-r-2 border-border-dark flex flex-col h-full"
    @drop="dropHandler"
    @dragover="dragOverHandler"
    @dragenter="file_dragging = true"
    @dragleave="file_dragging = false"
    :class="{ 'bg-[rgb(7,68,78)]': file_dragging }"
  >
    <!-- Header 區塊 -->
    <div class="p-5 border-b-2 border-border-dark">
      <h2 class="text-2xl font-pixel text-white">World Settings</h2>
      <p class="text-text-secondary text-xs font-mono mt-1">Customize generation</p>
    </div>

    <!-- 內容區塊 -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
      <!-- SEED ID -->
      <div class="space-y-2">
        <label class="text-lg font-pixel text-text-secondary">SEED ID</label>
        <div class="flex gap-2">
          <input
            type="text"
            class="mc-input flex-1 px-3 py-2"
            :value="settingsStore.seed"
            @change="(event: Event) => {
              settingsStore.seed = parseSeed((event.target as HTMLInputElement).value)
            }"
            :placeholder="i18n.t('settings.seed.label')"
          />
          <button
            @click="randomizeSeed"
            class="mc-button w-12 h-10 flex items-center justify-center"
            :title="i18n.t('settings.seed.randomize_button.title')"
          >
            <span class="material-symbols-outlined">casino</span>
          </button>
        </div>
      </div>

      <!-- WORLD PRESET / VERSION -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-2">
          <label class="text-sm font-pixel text-text-secondary">WORLD PRESET</label>
          <select v-model="settingsStore.world_preset" class="mc-input w-full px-2 py-2 text-sm">
            <option v-for="preset in ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes']" :value="Identifier.parse(preset)">
              {{ settingsStore.getLocalizedName('generator', Identifier.parse(preset), false) }}
            </option>
          </select>
        </div>
        <div class="space-y-2">
          <label class="text-sm font-pixel text-text-secondary">VERSION</label>
          <select v-model="settingsStore.mc_version" class="mc-input w-full px-2 py-2 text-sm">
            <option v-for="version in Object.keys(versionMetadata)" :value="version">
              {{ i18n.t(`settings.mc_version.mc${version}`) }}
            </option>
          </select>
        </div>
      </div>

      <!-- 分隔線 -->
      <div class="h-0.5 bg-border-dark"></div>

      <!-- Map Layers -->
      <div class="space-y-4">
        <h3 class="text-lg font-pixel text-white">Map Layers</h3>

        <!-- Biomes - 可展開下拉選單 -->
        <div class="space-y-2">
          <div
            @click="biomeDropdownOpen = !biomeDropdownOpen"
            class="flex items-center justify-between p-2 hover:bg-white/5 cursor-pointer group border border-transparent hover:border-white/10"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 flex items-center justify-center bg-[#5B8F34] border-2 border-white/20 shadow-sm">
                <span class="material-symbols-outlined text-white text-[18px]">grass</span>
              </div>
              <span class="text-lg font-pixel pt-1">Biomes</span>
              <span v-if="searchStore.biomes.size > 0" class="text-xs text-primary">({{ searchStore.biomes.size }})</span>
            </div>
            <span class="material-symbols-outlined text-text-secondary transition-transform" :class="{ 'rotate-180': biomeDropdownOpen }">expand_more</span>
          </div>
          <!-- Biome 列表 -->
          <div v-if="biomeDropdownOpen" class="bg-black/20 rounded p-2 max-h-60 overflow-y-auto custom-scrollbar">
            <!-- 搜索框 -->
            <input
              type="text"
              v-model="biomeSearchInput"
              class="mc-input w-full px-3 py-1.5 mb-2 text-sm"
              :placeholder="i18n.t('dropdown.search_biome.placeholder', 'Search biomes...')"
            />
            <!-- 全選 -->
            <label class="flex items-center gap-2 p-1.5 hover:bg-white/5 cursor-pointer border-b border-border-dark mb-2 pb-2">
              <input
                type="checkbox"
                :checked="allBiomesSelected"
                @change="toggleAllBiomes"
                class="w-4 h-4 rounded-none border-2 border-gray-500 bg-black accent-primary"
              />
              <span class="text-sm text-white font-medium">{{ i18n.t('dropdown.select_all', '全選') }}</span>
              <span class="text-xs text-text-secondary ml-auto">({{ filteredBiomes.length }})</span>
            </label>
            <!-- Biome 列表 -->
            <label
              v-for="biome in filteredBiomes"
              :key="biome.id"
              class="flex items-center gap-2 p-1.5 hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="searchStore.biomes.has(biome.id)"
                @change="toggleBiome(biome.id)"
                class="w-4 h-4 rounded-none border-2 border-gray-500 bg-black accent-primary"
              />
              <span class="w-3 h-3 rounded-sm" :style="{ backgroundColor: biome.color }"></span>
              <span class="text-sm text-white biome-name-cjk">{{ biome.name }}</span>
            </label>
          </div>
        </div>

        <!-- Structures - 可展開下拉選單 -->
        <div class="space-y-2">
          <div
            @click="structureDropdownOpen = !structureDropdownOpen"
            class="flex items-center justify-between p-2 hover:bg-white/5 cursor-pointer group border border-transparent hover:border-white/10"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 flex items-center justify-center bg-[#C69C6D] border-2 border-white/20 shadow-sm">
                <span class="material-symbols-outlined text-white text-[18px]">temple_hindu</span>
              </div>
              <span class="text-lg font-pixel pt-1">Structures</span>
              <span v-if="searchStore.structures.size > 0" class="text-xs text-primary">({{ searchStore.structures.size }})</span>
            </div>
            <span class="material-symbols-outlined text-text-secondary transition-transform" :class="{ 'rotate-180': structureDropdownOpen }">expand_more</span>
          </div>
          <!-- Structure 列表 -->
          <div v-if="structureDropdownOpen" class="bg-black/20 rounded p-2 max-h-60 overflow-y-auto custom-scrollbar">
            <!-- 全選 -->
            <label class="flex items-center gap-2 p-1.5 hover:bg-white/5 cursor-pointer border-b border-border-dark mb-2 pb-2">
              <input
                type="checkbox"
                :checked="allStructuresSelected"
                @change="toggleAllStructures"
                class="w-4 h-4 rounded-none border-2 border-gray-500 bg-black accent-primary"
              />
              <span class="text-sm text-white font-medium">{{ i18n.t('dropdown.select_all', '全選') }}</span>
              <span class="text-xs text-text-secondary ml-auto">({{ availableStructures.length }})</span>
            </label>
            <!-- 結構列表 -->
            <label
              v-for="structure in availableStructures"
              :key="structure.id"
              class="flex items-center gap-2 p-1.5 hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="searchStore.structures.has(structure.id)"
                @change="toggleStructure(structure.id)"
                class="w-4 h-4 rounded-none border-2 border-gray-500 bg-black accent-primary"
              />
              <img :src="loadedDimensionStore.getIcon(Identifier.parse(structure.id), 0, 0)" class="w-5 h-5" />
              <span class="text-sm text-white biome-name-cjk">{{ structure.name }}</span>
            </label>
          </div>
        </div>

        <!-- Slime Chunks -->
        <label class="flex items-center justify-between p-2 hover:bg-white/5 cursor-pointer group border border-transparent hover:border-white/10">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 flex items-center justify-center bg-[#72C14F] border-2 border-white/20 shadow-sm">
              <span class="material-symbols-outlined text-white text-[18px]">opacity</span>
            </div>
            <span class="text-lg font-pixel pt-1">Slime Chunks</span>
          </div>
          <input type="checkbox" v-model="showSlimeChunks" class="w-5 h-5 rounded-none border-2 border-gray-500 bg-black accent-primary" />
        </label>
      </div>

      <!-- 分隔線 -->
      <div class="h-0.5 bg-border-dark"></div>

      <!-- 等高線設定 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-lg font-pixel text-text-secondary">{{ i18n.t('settings.contour.label', '等高線') }}</label>
          <span class="text-sm font-pixel text-white">
            {{ settingsStore.contourInterval === 0 ? i18n.t('settings.contour.off', 'OFF') : settingsStore.contourInterval }}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="50"
          step="5"
          v-model.number="settingsStore.contourInterval"
          class="w-full h-2 bg-border-dark rounded-none appearance-none cursor-pointer accent-primary"
        />
      </div>

      <!-- 分隔線 -->
      <div class="h-0.5 bg-border-dark"></div>

      <!-- Datapack -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-pixel text-text-secondary">DATAPACK</h3>
          <button
            @click="openDropdownOpen = true"
            class="mc-button px-3 py-1 text-sm font-pixel flex items-center gap-1"
          >
            <span class="material-symbols-outlined text-[16px]">add</span>
            Add
          </button>
        </div>
        <p class="text-xs text-text-secondary">{{ i18n.t('menu.add.title', '拖放 zip 或資料夾') }}</p>
        <!-- Datapack Dropdown -->
        <Transition>
          <OpenDropdown
            v-if="openDropdownOpen"
            v-on-click-outside="() => { openDropdownOpen = false }"
            @close="openDropdownOpen = false"
            class="!relative !mt-0"
          />
        </Transition>
      </div>
    </div>

    <!-- Footer -->
    <div class="p-4 border-t-2 border-border-dark space-y-3">
      <!-- Dev Mode Toggle -->
      <label class="flex items-center justify-between p-2 hover:bg-white/5 cursor-pointer group border border-transparent hover:border-white/10">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 flex items-center justify-center bg-[#6B7280] border-2 border-white/20 shadow-sm">
            <span class="material-symbols-outlined text-white text-[18px]">code</span>
          </div>
          <span class="text-lg font-pixel pt-1">{{ i18n.t('settings.dev_mode.label') }}</span>
        </div>
        <input type="checkbox" v-model="settingsStore.dev_mode" class="w-5 h-5 rounded-none border-2 border-gray-500 bg-black accent-primary" />
      </label>

      <Footer />
    </div>
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

/* Range slider 樣式 */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--color-primary);
  border: 2px solid white;
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--color-primary);
  border: 2px solid white;
  cursor: pointer;
  border-radius: 0;
}

/* Transition */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.2s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
