<script setup lang="ts">
import { ref, onBeforeMount } from 'vue';
import Header from './components/Header.vue';
import MainMap from './components/MainMap.vue';
import Sidebar from './components/Sidebar.vue';
import { useLoadedDimensionStore } from './stores/useLoadedDimensionStore';
import { useSearchStore } from './stores/useBiomeSearchStore';
import { WorldgenStructure } from 'deepslate';

const loaded = ref(false)
const searchStore = useSearchStore()

const mainMapRef = ref<InstanceType<typeof MainMap> | null>(null)
const sidebarRef = ref<InstanceType<typeof Sidebar> | null>(null)

function handleGoto(x: number, z: number) {
  mainMapRef.value?.gotoPosition(x, z)
}

onBeforeMount(async () => {
  const loadedDimensionStore = useLoadedDimensionStore()
  await loadedDimensionStore.reload()

  // 預設啟用所有結構
  for (const id of WorldgenStructure.REGISTRY.keys()) {
    if (!loadedDimensionStore.loaded_dimension.hidden_structures?.has(id.toString())) {
      searchStore.structures.add(id.toString())
    }
  }

  loaded.value = true
})
</script>

<template>
  <div class="flex flex-col h-screen bg-background-dark" v-if="loaded">
    <Header />
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <!-- Sidebar 固定顯示 w-80 -->
      <Sidebar ref="sidebarRef" class="w-80 shrink-0 h-full" @goto="handleGoto" />
      <!-- Map 佔剩餘空間 -->
      <MainMap ref="mainMapRef" class="flex-1 min-h-0" />
    </div>
  </div>
  <div class="flex items-center justify-center h-screen bg-background-dark" v-else>
    <p class="text-5xl text-white font-pixel">Loading...</p>
  </div>
</template>

<style scoped>
/* 桌面版固定佈局，不做 RWD */
</style>
