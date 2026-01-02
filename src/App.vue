<script setup lang="ts">
import { onBeforeMount, ref } from 'vue';
import Collapsable from './components/Collapsable.vue';
import MainMap from './components/MainMap.vue';
import Sidebar from './components/Sidebar.vue';
import { useLoadedDimensionStore } from './stores/useLoadedDimensionStore';
import { useUiStore } from './stores/useUiStore';
import { useSearchStore } from './stores/useBiomeSearchStore';
import Popup from './components/Popup.vue';
import ModrinthMenu from './components/modrinth/ModrinthMenu.vue';
import { WorldgenStructure } from 'deepslate';

const loaded = ref(false)

const uiStore = useUiStore()
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
  <div class="layout" v-if="loaded">
    <Collapsable>
      <Sidebar ref="sidebarRef" @goto="handleGoto" />
    </Collapsable>
    <MainMap ref="mainMapRef" />
  </div>
  <div class="layout loading" v-else>
    <p>Loading...</p>
  </div>
</template>

<style scoped>
.layout {
  width: 100%;
  height: 100%;
  display: flex;
}

.loading{
  font-size: 5rem;
  color: white;
  align-items: center;
  justify-content: center;
}

p{
  height: fit-content;
}
</style>
