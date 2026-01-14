<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Identifier } from 'deepslate'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useI18n } from 'vue-i18n'
import { updateUrlParam } from '../util'
import { EventTracker } from '../util/EventTracker'

const settingsStore = useSettingsStore()
const i18n = useI18n()

// Renderer toggle state - default to mcseedmap (faster)
const useCubiomes = ref(false)
const isLoading = ref(false)

// Emit event for MainMap to handle
const emit = defineEmits<{
    (e: 'renderer-change', useCubiomes: boolean): void
}>()

// Initialize from URL param
onMounted(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const renderer = urlParams.get('renderer')
    if (renderer === 'cubiomes') {
        useCubiomes.value = true
    }
})

// Toggle renderer
async function toggleRenderer() {
    if (isLoading.value) return

    isLoading.value = true
    useCubiomes.value = !useCubiomes.value

    // Update URL - cubiomes needs param, mcseedmap is default
    if (useCubiomes.value) {
        updateUrlParam('renderer', 'cubiomes')
    } else {
        updateUrlParam('renderer', null)  // Remove param for default
    }

    // Emit event for MainMap
    emit('renderer-change', useCubiomes.value)

    // Loading state will be cleared by MainMap after switch completes
    setTimeout(() => {
        isLoading.value = false
    }, 800)

    EventTracker.track(`switch_renderer/${useCubiomes.value ? 'cubiomes' : 'mcseedmap'}`)
}

function updateLocale(locale: string) {
    i18n.locale.value = locale
    updateUrlParam('lang', locale)
    EventTracker.track(`change_locale/${locale}`)
}

// 維度選項
const dimensions = [
    { id: 'minecraft:overworld', label: 'OVERWORLD', icon: 'grass', bgClass: 'peer-checked:bg-primary/20 peer-checked:border-primary' },
    { id: 'minecraft:the_nether', label: 'NETHER', icon: 'local_fire_department', bgClass: 'peer-checked:bg-red-900/50 peer-checked:border-red-600' },
    { id: 'minecraft:the_end', label: 'THE END', icon: 'visibility', bgClass: 'peer-checked:bg-purple-900/50 peer-checked:border-purple-500' },
]

const currentDimension = computed(() => settingsStore.dimension.toString())
const setDimension = (id: string) => {
    settingsStore.dimension = Identifier.parse(id)
}
</script>

<template>
    <header class="flex items-center justify-between border-b-2 border-border-dark bg-surface-dark px-6 py-3 h-16 z-20 shrink-0">
        <!-- 左側：Logo + Nav -->
        <div class="flex items-center gap-8">
            <!-- Logo -->
            <div class="flex items-center gap-3 text-white">
                <div class="size-10 bg-primary border-2 border-white/20 flex items-center justify-center shadow-pixel-sm">
                    <span class="material-symbols-outlined !text-[24px]">grass</span>
                </div>
                <h1 class="text-2xl font-pixel tracking-wide text-white drop-shadow-md">MC Seed Map</h1>
            </div>

            <!-- Navigation -->
            <nav class="flex items-center gap-6">
                <a class="text-white text-sm font-bold uppercase tracking-widest hover:text-primary transition-colors font-pixel text-lg" href="#">Map</a>
                <a class="text-text-secondary text-sm font-bold uppercase tracking-widest hover:text-white transition-colors font-pixel text-lg" href="#">Seeds</a>
                <a class="text-text-secondary text-sm font-bold uppercase tracking-widest hover:text-white transition-colors font-pixel text-lg" href="#">Apps</a>
            </nav>
        </div>

        <!-- 中間：維度選擇器 -->
        <div class="absolute left-1/2 -translate-x-1/2">
            <div class="glass-panel p-1 flex gap-1">
                <label v-for="dim in dimensions" :key="dim.id" class="cursor-pointer">
                    <input
                        type="radio"
                        name="dimension"
                        :checked="currentDimension === dim.id"
                        @change="setDimension(dim.id)"
                        class="peer sr-only"
                    />
                    <div :class="[
                        'px-4 py-1.5 border-2 border-transparent text-text-secondary hover:text-white transition-none flex items-center gap-2',
                        dim.bgClass
                    ]">
                        <span class="material-symbols-outlined text-lg">{{ dim.icon }}</span>
                        <span class="font-pixel text-base pt-0.5">{{ dim.label }}</span>
                    </div>
                </label>
            </div>
        </div>

        <!-- 右側：語言 + 狀態 + 登入 -->
        <div class="flex items-center gap-4">
            <!-- Language Selector -->
            <div class="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10">
                <span class="material-symbols-outlined text-text-secondary text-lg">language</span>
                <select
                    :value="i18n.locale.value"
                    @change="(e: Event) => updateLocale((e.target as HTMLSelectElement).value)"
                    class="bg-transparent text-text-secondary text-lg font-pixel pt-1 cursor-pointer outline-none border-none"
                >
                    <option v-for="lang in i18n.availableLocales" :key="lang" :value="lang" class="bg-surface-dark text-white">
                        {{ i18n.t("locale.local_name", [], { locale: lang }) }}
                    </option>
                </select>
            </div>

            <!-- Renderer Toggle -->
            <button
                @click="toggleRenderer"
                class="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 cursor-pointer hover:bg-black/60 transition-colors"
                :title="isLoading ? 'Switching...' : `Click to switch to ${useCubiomes ? 'mcseedmap' : 'cubiomes'}`"
                :disabled="isLoading"
            >
                <span
                    class="w-2 h-2 rounded-full"
                    :class="isLoading ? 'bg-yellow-500 animate-spin' : (useCubiomes ? 'bg-green-500 animate-pulse' : 'bg-red-500')"
                ></span>
                <span class="text-lg text-text-secondary font-pixel pt-1">
                    {{ isLoading ? 'Switching...' : (useCubiomes ? 'cubiomes' : 'mcseedmap') }}
                </span>
            </button>
        </div>
    </header>
</template>
