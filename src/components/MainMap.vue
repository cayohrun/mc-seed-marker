<script setup lang="ts">
import "leaflet/dist/leaflet.css";
import L, { control } from "leaflet";
import { McseedmapBiomeLayer } from "../MapLayers/McseedmapBiomeLayer";
import { Graticule } from "../MapLayers/Graticule";
import { onMounted, ref, watch, watchEffect } from 'vue';
import BiomeTooltip from './BiomeTooltip.vue';
import { BlockPos, Chunk, ChunkPos, DensityFunction, Identifier, RandomState, Structure, StructurePlacement, StructureSet, WorldgenStructure } from 'deepslate';
import YSlider from './YSlider.vue';
import { useSearchStore } from '../stores/useBiomeSearchStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLoadedDimensionStore } from '../stores/useLoadedDimensionStore'
import { useMarkersStore, type Marker } from '../stores/useMarkersStore';
import { useStructureNotesStore, AVAILABLE_STRUCTURE_ICONS } from '../stores/useStructureNotesStore';
import { CachedBiomeSource } from '../util/CachedBiomeSource';
import MapButton from './MapButton.vue';
import { SpawnTarget } from '../util/SpawnTarget';
import { useI18n } from 'vue-i18n';
import { versionMetadata } from "../util";

const emit = defineEmits<{
  (e: 'add-marker', x: number, z: number): void
}>()

const searchStore = useSearchStore()
const settingsStore = useSettingsStore()
const loadedDimensionStore = useLoadedDimensionStore()
const markersStore = useMarkersStore()
const structureNotesStore = useStructureNotesStore()
const i18n = useI18n()

let biomeLayer: McseedmapBiomeLayer
let graticule: Graticule

const tooltip_left = ref(0)
const tooltip_top = ref(0)
const tooltip_biome = ref(Identifier.create("void"))
const tooltip_position = ref(BlockPos.ZERO)
const show_tooltip = ref(false)
const show_info = ref(false)

const do_hillshade = ref(true)
const show_sealevel = ref(false)
const project_down = ref(true)

const y = ref(320)

const show_graticule = ref(false)

watch(show_graticule, (value) => {
    if (value) {
        map.addLayer(graticule)
    } else {
        map.removeLayer(graticule)
    }
})

var map: L.Map
var zoom: L.Control.Zoom
var markers: L.LayerGroup
var userMarkers: L.LayerGroup
var spawnMarker: L.Marker

var marker_map = new Map<string, { marker?: L.Marker, structure?: {id: Identifier, pos: BlockPos}}>()
var user_marker_map = new Map<string, L.Marker>()
var needs_zoom = ref(false)



onMounted(() => {
    map = L.map("map", {
        zoom: -2,
        minZoom: -6,
        maxZoom: 1,
        center: [0, 0],
        zoomControl: false,
        crs: L.CRS.Simple,
        // 優化縮放動畫
        zoomAnimation: true,
        zoomAnimationThreshold: 4,
        fadeAnimation: true,
        markerZoomAnimation: true,
        zoomSnap: 1,             // 整數縮放，確保線條寬度一致
        zoomDelta: 1,            // 每次縮放 1 級
        wheelPxPerZoomLevel: 120 // 滾輪縮放靈敏度
    })

    zoom = L.control.zoom({
        position: i18n.t('locale.text_direction') === 'ltr' ? 'topright' : 'topleft'
    })
    zoom.addTo(map)

    biomeLayer = new McseedmapBiomeLayer({
            tileSize: 256,
            minZoom: -100
        },
        do_hillshade,
        y
    )

    map.addLayer(biomeLayer)

    spawnMarker = L.marker({lat: 0, lng: 0}, {
        icon: L.icon({
            iconUrl: "images/spawn_icon.png",
            iconAnchor: [16, 16],
            popupAnchor: [0, -10]
        }),
    }).bindPopup(L.popup())

    updateSpawnMarker()

    markers = L.layerGroup().addTo(map)
    userMarkers = L.layerGroup().addTo(map)

    map.addEventListener("mousemove", (evt: L.LeafletMouseEvent) => {
        //        await datapackStore.registered
        tooltip_left.value = evt.originalEvent.pageX-4
        tooltip_top.value = evt.originalEvent.pageY-4

        const pos = getPosition(map, evt.latlng)

        const biome = loadedDimensionStore.getBiomeSource()?.getBiome(pos[0] >> 2, pos[1] >> 2, pos[2] >> 2, loadedDimensionStore.sampler) ?? Identifier.create("plains")

        tooltip_biome.value = biome
        tooltip_position.value = pos
        show_tooltip.value = true
    })


    map.addEventListener("mouseout", (evt: L.LeafletMouseEvent) => {
        show_tooltip.value = false
    })

    // 右鍵點擊 - 新增標記
    map.addEventListener("contextmenu", async (evt: L.LeafletMouseEvent) => {
        const pos = getPosition(map, evt.latlng)
        
        // 彈出對話框新增標記
        const name = prompt(i18n.t('markers.prompt_name', '輸入標記名稱:'))
        if (name && name.trim()) {
            markersStore.addMarker(name.trim(), pos[0], pos[2])
            updateUserMarkers()
        }
    })
    
    // Shift + 右鍵 - 複製傳送指令（原功能）
    map.addEventListener("click", async (evt: L.LeafletMouseEvent) => {
        if (evt.originalEvent.shiftKey) {
            const pos = getPosition(map, evt.latlng)
            navigator.clipboard.writeText(`/execute in ${settingsStore.dimension.toString()} run tp ${pos[0].toFixed(0)} ${(pos[1] + (project_down.value ? 10 : 0)).toFixed(0)} ${pos[2].toFixed()}`)
            show_info.value = true
            setTimeout(() => show_info.value = false, 2000)
        }
    })


    map.on("moveend", (evt) => {
        setTimeout(updateMarkers, 5)
    })

    graticule = new Graticule()

    /*
    layer.on("tileunload", (evt) => {
        // @ts-expect-error: _tileCoordsToBounds does not exist
        const tileBounds = layer._tileCoordsToBounds(evt.coords);

    })*/

});

watch(i18n.locale, () => {
    zoom.setPosition(i18n.t('locale.text_direction') === 'ltr' ? 'topright' : 'topleft')
})

function getPosition(map: L.Map, latlng: L.LatLng) {
    const crs = map.options.crs!
    const pos = crs.project(latlng)
    pos.y *= -1

    const surface = (loadedDimensionStore.surface_density_function)?.compute(DensityFunction.context((pos.x >> 2) << 2, y.value, (pos.y >> 2) << 2)) ?? Number.POSITIVE_INFINITY

    const pos_y: number = project_down.value ? Math.min(surface, y.value) : y.value
    return BlockPos.create(pos.x, pos_y, pos.y)
}

function isInBounds(pos: ChunkPos, min: ChunkPos, max: ChunkPos) {
    return (pos[0] >= min[0] && pos[0] <= max[0] && pos[1] >= min[1] && pos[1] <= max[1])
}


function updateMarkers() {
    const biomeSource = loadedDimensionStore.getBiomeSource()
    if (biomeSource === undefined) {
        return
    }

    const cachedBiomeSource = new CachedBiomeSource(biomeSource)
    const context = new WorldgenStructure.GenerationContext(settingsStore.seed, cachedBiomeSource, loadedDimensionStore.noise_generator_settings, loadedDimensionStore.loaded_dimension.level_height ?? {minY: 0, height: 256})

    const bounds = map.getBounds()

    const crs = map.options.crs!
    const minPos = crs.project(bounds.getNorthWest())
    const maxPos = crs.project(bounds.getSouthEast())

    const minChunk = ChunkPos.create(minPos.x >> 4, -minPos.y >> 4)
    const maxChunk = ChunkPos.create(maxPos.x >> 4, -maxPos.y >> 4)

    var _needs_zoom = false

    const keptMarkers: Set<string> = new Set()

    const scheduler = ('scheduler' in window) ? ((task: () => void) => (window as any).scheduler.postTask(task, {priority: "background"})) : ((task: () => void) => setTimeout(task, 1))

    // 限制每次更新的最大任務數，避免主線程阻塞
    const MAX_TASKS_PER_UPDATE = 500
    let taskCount = 0

    for (const id of searchStore.structure_sets.sets) {
        const set = StructureSet.REGISTRY.get(id)
        if (!set) continue

        var minZoom = 2

        if (set.placement instanceof StructurePlacement.ConcentricRingsStructurePlacement){
            set.placement.prepare(biomeSource, loadedDimensionStore.sampler, settingsStore.seed)
            minZoom = -2
        } else if (set.placement instanceof StructurePlacement.RandomSpreadStructurePlacement) {
            const chunkFrequency = (set.placement.frequency) / (set.placement.spacing * set.placement.spacing)
            minZoom = -Math.log2(1/(chunkFrequency * 128))
        }

        if (map.getZoom() >= minZoom){
            const chunks: ChunkPos[] = set.placement.getPotentialStructureChunks(settingsStore.seed, minChunk[0], minChunk[1], maxChunk[0], maxChunk[1])

            for (const chunk of chunks) {
                const storage_id = `${id.toString()} ${chunk[0]},${chunk[1]}`
                const inBounds = isInBounds(chunk, minChunk, maxChunk)
                const stored = marker_map.get(storage_id)

                if (inBounds){
                    if (stored === undefined) {
                        // 超過任務限制時跳過新任務
                        if (taskCount >= MAX_TASKS_PER_UPDATE) continue

                        const m: { marker?: L.Marker, structure?: {id: Identifier, pos: BlockPos} } = {}

                        marker_map.set(storage_id, m)
                        taskCount++

                        scheduler(() => {
                            if (marker_map.get(storage_id) !== m) return

                            cachedBiomeSource.setupCache(chunk[0] << 2, chunk[1] << 2)
                            const structure = set.getStructureInChunk(chunk[0], chunk[1], context)

                            const marker = structure && searchStore.structures.has(structure.id.toString()) ? getMarker(structure.id, structure.pos) : undefined
                            m.structure = structure
                            m.marker = marker
                        })
                    } else {
                        if (stored.structure){
                            const should_have_marker = searchStore.structures.has(stored.structure?.id.toString())
                            if (should_have_marker && stored.marker === undefined){
                                stored.marker = getMarker(stored.structure.id, stored.structure.pos)
                            } else if (!should_have_marker && stored.marker !== undefined){
                                stored.marker.remove()
                                stored.marker = undefined
                            }
                        }
                    }
                    keptMarkers.add(storage_id)
                }
            }
        } else {
            _needs_zoom = true
        }
    }

    for (const key of marker_map.keys()){
        if (!keptMarkers.has(key)){
            const marker = marker_map.get(key)
            marker?.marker?.remove()
            marker_map.delete(key)
        }
    }

    needs_zoom.value = _needs_zoom
}

function getMarker(structureId: Identifier, pos: BlockPos) {
    const crs = map.options.crs!
    const mapPos = new L.Point(pos[0], -pos[2])
    const structureIdStr = structureId.toString()

    // 創建彈窗內容生成函數
    const createPopupContent = () => {
        const note = structureNotesStore.getNote(structureIdStr, pos[0], pos[2])
        const noteText = note?.note || ''
        const currentIcon = note?.customIcon || structureNotesStore.getStructureIcon(structureIdStr) || ''

        // 創建圖示選項 HTML
        const iconOptionsHtml = AVAILABLE_STRUCTURE_ICONS.map(icon =>
            `<option value="${icon.value}" ${currentIcon === icon.value ? 'selected' : ''}>${icon.name}</option>`
        ).join('')

        return `
            <div class="structure-popup">
                <div class="structure-name">${settingsStore.getLocalizedName("structure", structureId, false)}</div>
                <div class="structure-coords">${i18n.t("map.coords.xyz", {x: pos[0], y: pos[1], z: pos[2]})}</div>
                <hr style="margin: 8px 0; border-color: #444;" />
                <div class="structure-note-section">
                    <label style="font-size: 11px; color: #aaa;">備註：</label>
                    <textarea id="note-input-${pos[0]}-${pos[2]}"
                        placeholder="添加備註..."
                        style="width: 100%; min-height: 50px; margin-top: 4px; padding: 4px; border-radius: 4px; border: 1px solid #555; background: #333; color: #fff; font-size: 12px; resize: vertical;"
                    >${noteText}</textarea>
                </div>
                <div class="structure-icon-section" style="margin-top: 8px;">
                    <label style="font-size: 11px; color: #aaa;">圖示：</label>
                    <select id="icon-select-${pos[0]}-${pos[2]}"
                        style="width: 100%; margin-top: 4px; padding: 4px; border-radius: 4px; border: 1px solid #555; background: #333; color: #fff; font-size: 12px;">
                        <option value="">預設</option>
                        ${iconOptionsHtml}
                    </select>
                </div>
                <button id="save-note-${pos[0]}-${pos[2]}"
                    style="width: 100%; margin-top: 8px; padding: 6px; border-radius: 4px; border: none; background: #22c55e; color: #fff; cursor: pointer; font-size: 12px;">
                    儲存
                </button>
            </div>
        `
    }

    const popup = L.popup({ minWidth: 200, maxWidth: 250 }).setContent(createPopupContent)
    const marker = L.marker(crs.unproject(mapPos))
    marker.bindPopup(popup).addTo(markers)

    // 當彈窗打開時，綁定儲存按鈕事件
    marker.on('popupopen', () => {
        const saveBtn = document.getElementById(`save-note-${pos[0]}-${pos[2]}`)
        const noteInput = document.getElementById(`note-input-${pos[0]}-${pos[2]}`) as HTMLTextAreaElement
        const iconSelect = document.getElementById(`icon-select-${pos[0]}-${pos[2]}`) as HTMLSelectElement

        if (saveBtn && noteInput && iconSelect) {
            saveBtn.onclick = () => {
                const newNote = noteInput.value.trim()
                const newIcon = iconSelect.value || undefined

                structureNotesStore.setNote(structureIdStr, pos[0], pos[2], newNote, newIcon)

                // 如果圖示變更，更新 marker 圖示
                if (newIcon) {
                    // 本地路徑直接使用，否則包裝成 mcicons URL
                    const newIconUrl = newIcon.startsWith('/') ? newIcon : `https://raw.githubusercontent.com/jacobsjo/mcicons/icons/item/${newIcon}.png`
                    marker.setIcon(L.icon({
                        iconUrl: newIconUrl,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        shadowUrl: 'shadow.png',
                        shadowSize: [40, 40],
                        shadowAnchor: [20, 20],
                        popupAnchor: [0, -10]
                    }))
                }

                // 顯示儲存成功
                saveBtn.textContent = '已儲存 ✓'
                saveBtn.style.background = '#16a34a'
                setTimeout(() => {
                    saveBtn.textContent = '儲存'
                    saveBtn.style.background = '#22c55e'
                }, 1500)
            }
        }
    })

    const iconUrl = loadedDimensionStore.getIcon(structureId, pos[0], pos[2])
    marker.setIcon(L.icon({
        iconUrl: iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        shadowUrl: 'shadow.png',
        shadowSize: [40, 40],
        shadowAnchor: [20, 20],
        popupAnchor: [0, -10]
    }))
    return marker
}

// 用戶標記相關函數
function updateUserMarkers() {
    // 清除所有舊標記
    for (const marker of user_marker_map.values()) {
        marker.remove()
    }
    user_marker_map.clear()
    
    // 添加新標記
    for (const userMarker of markersStore.markers) {
        addUserMarkerToMap(userMarker)
    }
}

function addUserMarkerToMap(userMarker: Marker) {
    const crs = map.options.crs!
    const mapPos = new L.Point(userMarker.x, -userMarker.z)
    
    // 創建自訂圖標
    const iconHtml = `
        <div style="
            width: 28px;
            height: 28px;
            background-color: ${userMarker.color};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 5px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
        ">
            <i class="fa-solid fa-${getIconName(userMarker.icon)}"></i>
        </div>
    `
    
    const icon = L.divIcon({
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
        className: 'user-marker-icon'
    })
    
    const popup = L.popup().setContent(() => `
        <strong>${userMarker.name}</strong><br />
        ${i18n.t("map.coords.xz", {x: userMarker.x, z: userMarker.z})}
    `)
    
    const marker = L.marker(crs.unproject(mapPos), { icon })
    marker.bindPopup(popup).addTo(userMarkers)
    
    user_marker_map.set(userMarker.id, marker)
}

function getIconName(iconValue: string): string {
    const iconMap: { [key: string]: string } = {
        'home': 'house',
        'farm': 'wheat-awn',
        'mine': 'gem',
        'village': 'building',
        'fortress': 'chess-rook',
        'temple': 'landmark',
        'portal': 'door-open',
        'pin': 'location-dot'
    }
    return iconMap[iconValue] || 'location-dot'
}

// 跳轉到指定座標
function gotoPosition(x: number, z: number) {
    const crs = map.options.crs!
    const mapPos = new L.Point(x, -z)
    map.setView(crs.unproject(mapPos), map.getZoom())
}

defineExpose({ gotoPosition })

function updateSpawnMarker(){
    if (settingsStore.dimension.equals(Identifier.create("overworld"))){
        const crs = map.options.crs!
        const spawnTarget = SpawnTarget.fromJson(loadedDimensionStore.loaded_dimension.noise_settings_json?.spawn_target, versionMetadata[settingsStore.mc_version].spawnAlgorithm)
        const spawn = spawnTarget.getSpawnPoint(loadedDimensionStore.sampler)
        const pos = new L.Point(spawn[0] + 7, - spawn[1] - 7)
        spawnMarker.setLatLng(crs.unproject(pos))
        spawnMarker.bindPopup(L.popup().setContent(() => `${i18n.t("map.tooltip.spawn")}<br />${i18n.t("map.coords.xz", {x: spawn[0] + 7, z: spawn[1] + 7})}`))
        spawnMarker.addTo(map)
    } else {
        spawnMarker.removeFrom(map)
    }

}

loadedDimensionStore.$subscribe((mutation, state) => {
    for (const marker of marker_map.values()){
        marker.marker?.remove()
    }
    marker_map.clear()
    updateMarkers()
    updateSpawnMarker()

    const level_height = loadedDimensionStore.loaded_dimension.level_height
    if (level_height){
        if (project_down.value && loadedDimensionStore.surface_density_function !== undefined){
            y.value = level_height.minY + level_height.height || y.value
        } else {
            y.value = Math.max(Math.min(y.value, level_height.minY + level_height.height), level_height.minY)
        }
    } 
})

watch(searchStore.structures, () => {
    updateMarkers()
})

// 監聽用戶標記變化
watch(() => markersStore.markers, () => {
    updateUserMarkers()
}, { deep: true })

// 監聯 seed 變化時更新標記
watch(() => [settingsStore.seed, settingsStore.mc_version, settingsStore.dimension], () => {
    const seedKey = `${settingsStore.seed.toString()}_${settingsStore.mc_version}_${settingsStore.dimension.toString()}`

    markersStore.setSeed(
        settingsStore.seed,
        settingsStore.mc_version,
        settingsStore.dimension.toString()
    )
    structureNotesStore.setSeedKey(seedKey)
    updateUserMarkers()
}, { immediate: true })

</script>
  
<template>
    <div id="map_container">
        <div id="map">
        </div>
        <div class="map_options">
            <Suspense>
                <YSlider class="slider" v-model:y="y" />
            </Suspense>
            <MapButton icon="fa-arrows-down-to-line" :disabled="loadedDimensionStore.surface_density_function === undefined" v-model="project_down" :title="i18n.t('map.setting.project')" />
            <MapButton icon="fa-mountain-sun" :disabled="(!project_down || loadedDimensionStore.surface_density_function === undefined) && ! loadedDimensionStore.terrain_density_function" v-model="do_hillshade"  :title="i18n.t('map.setting.hillshade')" />
            <MapButton icon="fa-water" :disabled="loadedDimensionStore.surface_density_function === undefined" v-model="show_sealevel" :title="i18n.t('map.setting.sealevel')" />
            <MapButton icon="fa-table-cells" v-model="show_graticule" :title="i18n.t('map.setting.graticule')" />
        </div>
    </div>
    <BiomeTooltip id="tooltip" v-if="show_tooltip" :style="{ left: tooltip_left + 'px', top: tooltip_top + 'px' }"
        :biome="tooltip_biome" :pos="tooltip_position" />
    <div class="top">
        <Transition>
            <div class="info zoom" v-if="needs_zoom">
                {{ i18n.t('map.info.structures_hidden') }}
            </div>
        </Transition>
        <Transition>
            <div class="info unsupported" v-if="searchStore.structure_sets.has_invalid">
                {{ i18n.t('map.error.structures_unsupported') }}
            </div>
        </Transition>
    </div>
    <Transition>
        <div class="info bottom teleport" v-if="show_info">
            {{ i18n.t('map.info.teleport_command_copied') }}
        </div>
    </Transition>
</template>

<style scoped>
#map_container {
    width: 100%;
    flex-grow: 1;
    position: relative;
}

#map {
    width: 100%;
    height: 100%;
    cursor: crosshair;
    background: white url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill-opacity=".25" ><rect x="20" width="20" height="20" /><rect y="20" width="20" height="20" /></svg>');
    background-size: 25px 25px;
}

#map.leaflet-drag-target {
    cursor: grab;
}

.map_options {
    position: absolute;
    z-index: 600;
    top: 5rem;
    right: 0.85rem;
    display: flex;
    flex-direction: column;
    align-items: end;
    gap: 0.5rem;
}

.map_options:dir(rtl) {
    right: unset;
    left: 0.85rem;
}

#tooltip {
    position: absolute;
    pointer-events: none;
    z-index: 500;
}


.top{
    position: absolute;
    z-index: 500;
    left: 50%;
    transform: translateX(-50%);
    top: 0.5rem;
}

.bottom {
    position: absolute;
    z-index: 500;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0.5rem;
}

.info {
    padding: 0.3rem;
    padding-left: 1rem;
    padding-right: 1rem;
    border-radius: 1rem;
    background-color: rgb(3, 33, 58);
    color: rgb(255, 255, 255);
    user-select: none;
    margin: 0.2rem;
}

.teleport {
    color: rgb(189, 189, 189);
}

.unsupported {
    background-color: rgb(165, 33, 33);
    border: 2px solid white
}

</style>

<style>
/* 用戶標記樣式 (non-scoped) */
.user-marker-icon {
    background: transparent !important;
    border: none !important;
}
</style>