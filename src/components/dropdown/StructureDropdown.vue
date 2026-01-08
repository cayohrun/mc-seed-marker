
<script setup lang="ts">
import { useSearchStore } from '../../stores/useBiomeSearchStore.js'
import { Identifier, WorldgenStructure } from 'deepslate';
import ListDropdown from './ListDropdown.vue';
import { useLoadedDimensionStore } from '../../stores/useLoadedDimensionStore.js';
import { useSettingsStore } from '../../stores/useSettingsStore.js';
import { useI18n } from 'vue-i18n';
import { isStructureInDimension } from '../../utils/dimensionStructures';
import { computed } from 'vue';

const {t, locale} = useI18n()

const searchStore = useSearchStore()
const loadedDimensionStore = useLoadedDimensionStore()
const settingsStore = useSettingsStore()

// 根據當前維度過濾結構
const filteredStructures = computed(() => {
    const dimensionId = settingsStore.dimension.toString()
    const structures = [...WorldgenStructure.REGISTRY.keys()]
        .filter(id => !loadedDimensionStore.loaded_dimension.hidden_structures?.has(id.toString()))
        .filter(id => isStructureInDimension(id.toString(), dimensionId))

    // 在 End 維度添加 End Gateway（由 cubiomes 計算，不在 deepslate registry 中）
    if (dimensionId === 'minecraft:the_end') {
        structures.push(Identifier.parse('minecraft:end_gateway'))
    }

    return structures
})

function toggleStructure(structure: Identifier){
    if (searchStore.structures.has(structure.toString())){
        searchStore.structures.delete(structure.toString())
    } else {
        searchStore.structures.add(structure.toString())
    }
    searchStore.$patch({}) // call $subscribe, not sure why this is necessary
}

function disableGroup(group: string){
    [...searchStore.structures].forEach(structure => {
        if (structure.startsWith(group + ":"))
            searchStore.structures.delete(structure)
    });
}

</script>

<template>
    <ListDropdown :type="'structure'" :placeholder="t('dropdown.structure_positions.placeholder')" :entries="filteredStructures" :icons="loadedDimensionStore.getIcon" :selected="searchStore.structures" @toggle="toggleStructure" @disableGroup="disableGroup" />
</template>

<style scoped>

</style>