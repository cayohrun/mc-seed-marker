<script setup lang="ts">
import "leaflet/dist/leaflet.css";
import L, { control } from "leaflet";
import { McseedmapBiomeLayer } from "../MapLayers/McseedmapBiomeLayer";
import { CubiomesBiomeLayer } from "../MapLayers/CubiomesBiomeLayer";
import { Graticule } from "../MapLayers/Graticule";
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue';

// Props for renderer switching
const props = defineProps<{
  useCubiomes: boolean
}>()
import { BlockPos, Chunk, ChunkPos, DensityFunction, Identifier, RandomState, Structure, StructurePlacement, StructureSet, WorldgenStructure } from 'deepslate';
import { useSearchStore } from '../stores/useBiomeSearchStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLoadedDimensionStore } from '../stores/useLoadedDimensionStore'
import { useMarkersStore, type Marker } from '../stores/useMarkersStore';
import { useStructureNotesStore, AVAILABLE_STRUCTURE_ICONS } from '../stores/useStructureNotesStore';
import { CachedBiomeSource } from '../util/CachedBiomeSource';
import { SpawnTarget } from '../util/SpawnTarget';
import { useI18n } from 'vue-i18n';
import { versionMetadata } from "../util";
import MarkersPanel from './MarkersPanel.vue';
import { isStructureInDimension } from '../utils/dimensionStructures';
import { useCubiomesStructure } from '../cubiomes/useCubiomesStructure';
import { icon as faIcon } from '@fortawesome/fontawesome-svg-core';
import { faHouse, faWheatAwn, faGem, faBuilding, faChessRook, faLandmark, faDoorOpen, faLocationDot } from '@fortawesome/free-solid-svg-icons';

const emit = defineEmits<{
  (e: 'add-marker', x: number, z: number): void
}>()

const markersPanelRef = ref<InstanceType<typeof MarkersPanel> | null>(null)

const searchStore = useSearchStore()
const settingsStore = useSettingsStore()
const loadedDimensionStore = useLoadedDimensionStore()
const markersStore = useMarkersStore()
const structureNotesStore = useStructureNotesStore()
const i18n = useI18n()
const { getBastionType, endCityHasShip, iglooHasBasement, ruinedPortalIsGiant, villageIsAbandoned, scanEndGateways } = useCubiomesStructure()

let biomeLayer: McseedmapBiomeLayer | CubiomesBiomeLayer
let graticule: Graticule

// Helper function to create biome layer
function createBiomeLayer(useCubiomes: boolean): McseedmapBiomeLayer | CubiomesBiomeLayer {
    const options = { tileSize: 256, minZoom: -100 }
    if (useCubiomes) {
        console.log('[MainMap] Creating CubiomesBiomeLayer')
        return new CubiomesBiomeLayer(options, do_hillshade, y)
    } else {
        console.log('[MainMap] Creating McseedmapBiomeLayer')
        return new McseedmapBiomeLayer(options, do_hillshade, y)
    }
}

// Watch for renderer switching (hot reload)
watch(() => props.useCubiomes, (newValue, oldValue) => {
    if (newValue === oldValue) return
    if (!map) return

    console.log(`[MainMap] Switching renderer: ${oldValue ? 'cubiomes' : 'mcseedmap'} -> ${newValue ? 'cubiomes' : 'mcseedmap'}`)

    // Remove old layer (triggers onRemove to cleanup workers)
    map.removeLayer(biomeLayer)

    // Create new layer
    biomeLayer = createBiomeLayer(newValue)

    // Add to map (below markers)
    map.addLayer(biomeLayer)
    biomeLayer.bringToBack()
})

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

// 縮放控制狀態
const mapReady = ref(false)
const currentZoom = ref(0)
const minZoom = ref(-6)
const maxZoom = ref(1)

const canZoomIn = computed(() => mapReady.value && currentZoom.value < maxZoom.value)
const canZoomOut = computed(() => mapReady.value && currentZoom.value > minZoom.value)
const canReset = computed(() => mapReady.value)

const onZoomEnd = () => { currentZoom.value = map.getZoom() }

const handleZoomIn = () => { if (canZoomIn.value) map.zoomIn() }
const handleZoomOut = () => { if (canZoomOut.value) map.zoomOut() }
const handleResetView = () => {
    if (!canReset.value) return
    const crs = map.options.crs!
    const latLng = crs.unproject(new L.Point(spawnX.value, -spawnZ.value))
    map.setView(latLng, 0)
}

// tp 輸入 - 單一輸入框 "X Z" 格式
const tpInput = ref('')

const handleTeleport = () => {
    if (!canReset.value) return
    const parts = tpInput.value.trim().split(/[\s,]+/)
    if (parts.length >= 2) {
        const x = parseInt(parts[0])
        const z = parseInt(parts[1])
        if (!isNaN(x) && !isNaN(z)) {
            const crs = map.options.crs!
            const latLng = crs.unproject(new L.Point(x, -z))
            map.setView(latLng, map.getZoom())
        }
    }
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

// 當前游標位置座標（用於底部資訊列）
const cursorX = ref(0)
const cursorZ = ref(0)

// 出生點座標
const spawnX = ref(0)
const spawnZ = ref(0)
const cursorBiomeName = computed(() => {
    const biome = tooltip_biome.value
    return settingsStore.getLocalizedName('biome', biome, false)
})

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
var gateway_marker_map = new Map<string, L.Marker>()  // End Gateway markers (computed by cubiomes)
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

    // Create initial biome layer based on prop
    biomeLayer = createBiomeLayer(props.useCubiomes)
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

    // rAF 節流 mousemove，減少主執行緒負擔
    let pendingMouseEvt: L.LeafletMouseEvent | null = null
    let mouseRafId: number | null = null

    const flushMousemove = () => {
        if (!pendingMouseEvt) {
            mouseRafId = null
            return
        }

        const evt = pendingMouseEvt
        pendingMouseEvt = null

        tooltip_left.value = evt.originalEvent.pageX - 4
        tooltip_top.value = evt.originalEvent.pageY - 4

        const pos = getPosition(map, evt.latlng)
        const biome = loadedDimensionStore.getBiomeSource()?.getBiome(
            pos[0] >> 2, pos[1] >> 2, pos[2] >> 2, loadedDimensionStore.sampler
        ) ?? Identifier.create("plains")

        tooltip_biome.value = biome
        tooltip_position.value = pos
        show_tooltip.value = true

        cursorX.value = pos[0]
        cursorZ.value = pos[2]

        mouseRafId = null
    }

    map.addEventListener("mousemove", (evt: L.LeafletMouseEvent) => {
        pendingMouseEvt = evt
        if (mouseRafId === null) {
            mouseRafId = requestAnimationFrame(flushMousemove)
        }
    })


    map.addEventListener("mouseout", (evt: L.LeafletMouseEvent) => {
        show_tooltip.value = false
    })

    // 右鍵點擊 - 新增標記 (使用 Leaflet popup)
    map.addEventListener("contextmenu", async (evt: L.LeafletMouseEvent) => {
        const pos = getPosition(map, evt.latlng)
        const popupId = `add-marker-${Date.now()}`

        // 創建顏色按鈕 HTML（色塊）
        const colorButtonsHtml = markersStore.MARKER_COLORS.map((color, i) =>
            `<button data-color="${color.value}" class="${popupId}-color-btn" title="${color.name}"
                style="width: 22px; height: 22px; background-color: ${color.value}; border: 2px solid ${i === 0 ? '#333' : 'transparent'}; border-radius: 2px; cursor: pointer; padding: 0;">
            </button>`
        ).join('')

        // 創建圖示按鈕 HTML（使用 FontAwesome SVG）
        const defaultColor = markersStore.MARKER_COLORS[0].value
        const iconButtonsHtml = markersStore.MARKER_ICONS.map((icon, i) =>
            `<button data-icon="${icon.value}" class="${popupId}-icon-btn" title="${icon.name}"
                style="width: 26px; height: 26px; background: ${i === 0 ? defaultColor + '33' : 'rgba(0,0,0,0.05)'}; border: 2px solid ${i === 0 ? defaultColor : 'transparent'}; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #666;">
                <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getIconSvg(icon.value)}</span>
            </button>`
        ).join('')

        const popupContent = `
            <div class="add-marker-popup">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">${i18n.t("map.coords.xz", {x: Math.round(pos[0]), z: Math.round(pos[2])})}</div>
                <input id="${popupId}-name" type="text"
                    placeholder="${i18n.t('markers.name_placeholder', '標記名稱')}"
                    style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #555; background: #333; color: #fff; font-size: 12px; margin-bottom: 8px; box-sizing: border-box;"
                />
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                    ${colorButtonsHtml}
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                    ${iconButtonsHtml}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button id="${popupId}-cancel"
                        style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid #555; background: #444; color: #fff; cursor: pointer; font-size: 12px;">
                        ${i18n.t('markers.cancel', '取消')}
                    </button>
                    <button id="${popupId}-save"
                        style="flex: 1; padding: 6px; border-radius: 4px; border: none; background: #22c55e; color: #fff; cursor: pointer; font-size: 12px;">
                        ${i18n.t('markers.confirm', '確認')}
                    </button>
                </div>
            </div>
        `

        const popup = L.popup({ minWidth: 260, maxWidth: 280, closeButton: true })
            .setLatLng(evt.latlng)
            .setContent(popupContent)
            .openOn(map)

        // 等待 DOM 渲染後綁定事件
        setTimeout(() => {
            const nameInput = document.getElementById(`${popupId}-name`) as HTMLInputElement
            const colorBtns = document.querySelectorAll(`.${popupId}-color-btn`) as NodeListOf<HTMLButtonElement>
            const iconBtns = document.querySelectorAll(`.${popupId}-icon-btn`) as NodeListOf<HTMLButtonElement>
            const saveBtn = document.getElementById(`${popupId}-save`)
            const cancelBtn = document.getElementById(`${popupId}-cancel`)

            // 追蹤選中的值
            let selectedColor = markersStore.MARKER_COLORS[0].value
            let selectedIcon = markersStore.MARKER_ICONS[0].value

            // 顏色按鈕點擊事件
            colorBtns.forEach(btn => {
                btn.onclick = () => {
                    selectedColor = btn.dataset.color || selectedColor
                    // 更新所有顏色按鈕樣式
                    colorBtns.forEach(b => b.style.borderColor = 'transparent')
                    btn.style.borderColor = '#333'
                    // 更新選中 icon 按鈕的邊框和背景
                    iconBtns.forEach(b => {
                        if (b.dataset.icon === selectedIcon) {
                            b.style.borderColor = selectedColor
                            b.style.background = selectedColor + '33'
                        }
                    })
                }
            })

            // 圖示按鈕點擊事件
            iconBtns.forEach(btn => {
                btn.onclick = () => {
                    selectedIcon = btn.dataset.icon || selectedIcon
                    // 更新所有圖示按鈕樣式
                    iconBtns.forEach(b => {
                        b.style.borderColor = 'transparent'
                        b.style.background = 'rgba(0,0,0,0.05)'
                    })
                    btn.style.borderColor = selectedColor
                    btn.style.background = selectedColor + '33'
                }
            })

            if (nameInput) {
                nameInput.focus()

                // Enter 鍵儲存
                nameInput.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter' && nameInput.value.trim()) {
                        markersStore.addMarker(
                            nameInput.value.trim(),
                            Math.round(pos[0]),
                            Math.round(pos[2]),
                            selectedColor,
                            selectedIcon
                        )
                        updateUserMarkers()
                        map.closePopup()
                    }
                })
            }

            if (saveBtn) {
                saveBtn.onclick = () => {
                    const name = nameInput?.value.trim()
                    if (name) {
                        markersStore.addMarker(
                            name,
                            Math.round(pos[0]),
                            Math.round(pos[2]),
                            selectedColor,
                            selectedIcon
                        )
                        updateUserMarkers()
                        map.closePopup()
                    }
                }
            }

            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    map.closePopup()
                }
            }
        }, 50)
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

    // 縮放控制初始化
    map.on('zoomend', onZoomEnd)
    currentZoom.value = map.getZoom()
    minZoom.value = map.getMinZoom()
    maxZoom.value = map.getMaxZoom()
    mapReady.value = true

    /*
    layer.on("tileunload", (evt) => {
        // @ts-expect-error: _tileCoordsToBounds does not exist
        const tileBounds = layer._tileCoordsToBounds(evt.coords);

    })*/

    // 避免佈局變動後 Leaflet 尺寸沒刷新
    setTimeout(() => map.invalidateSize(), 0)
});

// 清理監聽
onUnmounted(() => {
    map?.off('zoomend', onZoomEnd)
})

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

    const dimensionId = settingsStore.dimension.toString()

    for (const id of searchStore.structure_sets.sets) {
        const set = StructureSet.REGISTRY.get(id)
        if (!set) continue

        const hasStructureInDimension = set.structures.some(s => {
            const structureId = s.structure.key()?.toString()
            return structureId ? isStructureInDimension(structureId, dimensionId) : false
        })

        if (!hasStructureInDimension) {
            continue
        }

        var minZoom = 2

        // 檢查是否包含 End City（需要在較低縮放就能顯示）
        const hasEndCity = set.structures.some(s =>
            s.structure.key()?.toString() === 'minecraft:end_city'
        )

        if (set.placement instanceof StructurePlacement.ConcentricRingsStructurePlacement){
            set.placement.prepare(biomeSource, loadedDimensionStore.sampler, settingsStore.seed)
            minZoom = -2
        } else if (set.placement instanceof StructurePlacement.RandomSpreadStructurePlacement) {
            const chunkFrequency = (set.placement.frequency) / (set.placement.spacing * set.placement.spacing)
            minZoom = -Math.log2(1/(chunkFrequency * 128))
        }

        // End City 使用更低的最小縮放（照 Chunkbase 邏輯）
        if (hasEndCity) {
            minZoom = -4
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

                            const shouldShow = structure &&
                                searchStore.structures.has(structure.id.toString()) &&
                                isStructureInDimension(structure.id.toString(), dimensionId)
                            const marker = shouldShow ? getMarker(structure.id, structure.pos) : undefined
                            m.structure = structure
                            m.marker = marker
                        })
                    } else {
                        if (stored.structure){
                            const should_have_marker = searchStore.structures.has(stored.structure?.id.toString()) &&
                                isStructureInDimension(stored.structure.id.toString(), dimensionId)
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

    // End Gateway 掃描（僅在 End 維度且啟用 end_gateway 時）
    updateEndGateways(minChunk, maxChunk)
}

/**
 * 更新 End Gateway markers（由 cubiomes 計算）
 */
async function updateEndGateways(minChunk: ChunkPos, maxChunk: ChunkPos) {
    const dimensionId = settingsStore.dimension.toString()
    const isEndDimension = dimensionId === 'minecraft:the_end'
    const gatewayEnabled = searchStore.structures.has('minecraft:end_gateway')

    // 如果不是 End 維度或未啟用 gateway，清空所有 gateway markers
    if (!isEndDimension || !gatewayEnabled) {
        for (const marker of gateway_marker_map.values()) {
            marker.remove()
        }
        gateway_marker_map.clear()
        return
    }

    // 計算掃描範圍（chunk 座標）
    const width = maxChunk[0] - minChunk[0] + 1
    const height = maxChunk[1] - minChunk[1] + 1

    // 限制掃描範圍（與 End City minZoom=-4 對應，約 1000 chunks）
    if (width > 1000 || height > 1000) {
        return  // 範圍太大，不掃描
    }

    try {
        const gateways = await scanEndGateways(minChunk[0], minChunk[1], width, height, 500)

        // 追蹤本次應保留的 markers
        const keptGateways = new Set<string>()

        for (const gateway of gateways) {
            const key = `gateway_${gateway.x}_${gateway.z}`
            keptGateways.add(key)

            // 如果已存在，跳過
            if (gateway_marker_map.has(key)) continue

            // 創建新 marker
            const marker = createEndGatewayMarker(gateway.x, gateway.z)
            gateway_marker_map.set(key, marker)
        }

        // 移除不在視窗範圍內的 markers
        for (const [key, marker] of gateway_marker_map.entries()) {
            if (!keptGateways.has(key)) {
                marker.remove()
                gateway_marker_map.delete(key)
            }
        }
    } catch (error) {
        console.error('[MainMap] End Gateway scan error:', error)
    }
}

/**
 * 創建 End Gateway marker
 */
function createEndGatewayMarker(blockX: number, blockZ: number): L.Marker {
    const crs = map.options.crs!
    const mapPos = new L.Point(blockX, -blockZ)
    const structureId = Identifier.parse('minecraft:end_gateway')

    // 使用末影之眼圖示（End Gateway 沒有專用圖示）
    const icon = L.divIcon({
        className: 'end-gateway-icon',
        html: `
            <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                <img src="https://raw.githubusercontent.com/jacobsjo/mcicons/icons/item/ender_eye.png"
                     style="width: 32px; height: 32px; filter: drop-shadow(0 0 3px rgba(128,0,255,0.8)) drop-shadow(0 0 1px rgba(0,0,0,0.8));" />
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -10]
    })

    const marker = L.marker(crs.unproject(mapPos), { icon })
    marker.addTo(markers)

    // 創建彈窗
    const popupContent = `
        <div class="structure-popup">
            <div class="structure-name">End Gateway</div>
            <div class="structure-coords">${i18n.t("map.coords.xz", {x: blockX, z: blockZ})}</div>
        </div>
    `
    marker.bindPopup(popupContent)

    return marker
}

/**
 * 創建帶有鞘翅疊加的 End City 圖示
 */
function createEndCityWithShipIcon(baseIconUrl: string): L.DivIcon {
    return L.divIcon({
        className: 'end-city-ship-icon',
        html: `
            <div style="position: relative; width: 32px; height: 32px;">
                <img src="${baseIconUrl}" style="width: 32px; height: 32px;" />
                <img src="https://raw.githubusercontent.com/jacobsjo/mcicons/icons/item/elytra.png"
                     style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 20px; height: 20px; filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));" />
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -10]
    })
}

function getMarker(structureId: Identifier, pos: BlockPos) {
    const crs = map.options.crs!
    const mapPos = new L.Point(pos[0], -pos[2])
    const structureIdStr = structureId.toString()

    // 檢查是否需要顯示結構詳細資訊
    const isEndCity = structureIdStr === 'minecraft:end_city'
    const isBastion = structureIdStr === 'minecraft:bastion_remnant'
    const isIgloo = structureIdStr === 'minecraft:igloo'
    const isRuinedPortal = structureIdStr.startsWith('minecraft:ruined_portal')
    const isVillage = structureIdStr.startsWith('minecraft:village_')
    const needsStructureDetail = isEndCity || isBastion || isIgloo || isRuinedPortal || isVillage

    // 創建彈窗內容生成函數
    const createPopupContent = () => {
        const note = structureNotesStore.getNote(structureIdStr, pos[0], pos[2])
        const noteText = note?.note || ''
        const currentIcon = note?.customIcon || structureNotesStore.getStructureIcon(structureIdStr) || ''

        // 創建圖示選項 HTML
        const iconOptionsHtml = AVAILABLE_STRUCTURE_ICONS.map(icon =>
            `<option value="${icon.value}" ${currentIcon === icon.value ? 'selected' : ''}>${icon.name}</option>`
        ).join('')

        // 結構詳細資訊區塊（End City / Bastion）
        const structureDetailHtml = needsStructureDetail ? `
            <div id="structure-detail-${pos[0]}-${pos[2]}" class="structure-detail" style="margin: 8px 0; padding: 6px; background: #2a2a2a; border-radius: 4px; font-size: 12px; color: #aaa;">
                <span class="loading">Loading...</span>
            </div>
        ` : ''

        return `
            <div class="structure-popup">
                <div class="structure-name">${settingsStore.getLocalizedName("structure", structureId, false)}</div>
                <div class="structure-coords">${i18n.t("map.coords.xyz", {x: pos[0], y: pos[1], z: pos[2]})}</div>
                ${structureDetailHtml}
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
    marker.on('popupopen', async () => {
        const saveBtn = document.getElementById(`save-note-${pos[0]}-${pos[2]}`)
        const noteInput = document.getElementById(`note-input-${pos[0]}-${pos[2]}`) as HTMLTextAreaElement
        const iconSelect = document.getElementById(`icon-select-${pos[0]}-${pos[2]}`) as HTMLSelectElement
        const detailEl = document.getElementById(`structure-detail-${pos[0]}-${pos[2]}`)

        // 載入結構詳細資訊
        if (detailEl && needsStructureDetail) {
            try {
                // Bastion variant names mapping (from cubiomes finders.c)
                const BASTION_VARIANTS = ['Housing', 'Stables', 'Treasure', 'Bridge']

                if (isEndCity) {
                    const chunkX = pos[0] >> 4
                    const chunkZ = pos[2] >> 4
                    const hasShip = await endCityHasShip(chunkX, chunkZ)
                    if (hasShip === true) {
                        detailEl.innerHTML = '<span style="color: #4ade80;">Ship</span>'
                    } else {
                        // false 或 null 都不顯示額外文字
                        detailEl.remove()
                    }
                } else if (isBastion) {
                    const variant = await getBastionType(pos[0], pos[2])
                    if (variant !== null && variant >= 0 && variant < BASTION_VARIANTS.length) {
                        detailEl.innerHTML = `<span style="color: #f97316;">${BASTION_VARIANTS[variant]}</span>`
                    } else {
                        detailEl.remove()
                    }
                } else if (isIgloo) {
                    const hasBasement = await iglooHasBasement(pos[0], pos[2], 0)
                    if (hasBasement === true) {
                        detailEl.innerHTML = '<span style="color: #60a5fa;">Basement <span style="color: #888;">[50%]</span></span>'
                    } else {
                        detailEl.remove()
                    }
                } else if (isRuinedPortal) {
                    const isGiant = await ruinedPortalIsGiant(pos[0], pos[2], 0)
                    if (isGiant === true) {
                        detailEl.innerHTML = '<span style="color: #a855f7;">Giant <span style="color: #888;">[5%]</span></span>'
                    } else {
                        detailEl.remove()
                    }
                } else if (isVillage) {
                    const isAbandoned = await villageIsAbandoned(pos[0], pos[2], 0)
                    if (isAbandoned === true) {
                        detailEl.innerHTML = '<span style="color: #22c55e;">Zombie <span style="color: #888;">[2%]</span></span>'
                    } else {
                        detailEl.remove()
                    }
                }
            } catch (err) {
                console.error('[MainMap] Structure detail error:', err)
                detailEl.remove()
            }
        }

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

    // End City 異步查詢是否有 Ship，有的話更新圖示
    if (isEndCity) {
        const chunkX = pos[0] >> 4
        const chunkZ = pos[2] >> 4
        endCityHasShip(chunkX, chunkZ).then(hasShip => {
            if (hasShip === true) {
                marker.setIcon(createEndCityWithShipIcon(iconUrl))
            }
        }).catch(err => {
            console.error('[MainMap] End City ship check error:', err)
        })
    }

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
        ">
            <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">
                ${getIconSvg(userMarker.icon)}
            </span>
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

function getIconSvg(iconValue: string): string {
    const iconMap: { [key: string]: any } = {
        'home': faHouse,
        'farm': faWheatAwn,
        'mine': faGem,
        'village': faBuilding,
        'fortress': faChessRook,
        'temple': faLandmark,
        'portal': faDoorOpen,
        'pin': faLocationDot
    }
    const iconDef = iconMap[iconValue] || faLocationDot
    return faIcon(iconDef).html[0]
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
        // 保存出生點座標
        spawnX.value = spawn[0] + 7
        spawnZ.value = spawn[1] + 7
        const pos = new L.Point(spawnX.value, -spawnZ.value)
        spawnMarker.setLatLng(crs.unproject(pos))
        spawnMarker.bindPopup(L.popup().setContent(() => `${i18n.t("map.tooltip.spawn")}<br />${i18n.t("map.coords.xz", {x: spawnX.value, z: spawnZ.value})}`))
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
    <div class="map-wrapper">
    <div id="map_container">
        <div id="map">
        </div>
    </div>

    <!-- TP 輸入框 - 右上角 -->
    <div class="absolute top-6 right-6 z-[1000]">
        <div class="glass-panel flex items-center h-12 px-3 bg-black/80 border-2 border-gray-600">
            <span class="text-text-secondary font-pixel text-lg mr-2">> tp</span>
            <input
                v-model="tpInput"
                @keyup.enter="handleTeleport"
                class="bg-transparent border-none text-primary font-pixel text-xl focus:ring-0 focus:outline-none placeholder:text-gray-700 w-32 focus:w-48 transition-all pt-1"
                placeholder="X Z"
            />
            <button @click="handleTeleport" class="text-white hover:text-primary ml-1">
                <span class="material-symbols-outlined">subdirectory_arrow_left</span>
            </button>
        </div>
    </div>

    <!-- 座標資訊列 - 跟隨滑鼠游標 -->
    <div class="absolute bottom-6 left-6 z-[1000]">
        <div class="bg-status-bg border border-white/5 rounded-[12px] shadow-lg flex items-center px-6 py-3 gap-6">
            <div class="text-gray-400 font-pixel text-xl tracking-wide flex items-center gap-2">
                <span>COORDINATES</span>
                <span class="text-status-blue">X: {{ cursorX }}</span>,
                <span class="text-status-blue">Z: {{ cursorZ }}</span>,
                <span class="text-status-blue">Y: {{ Math.round(tooltip_position[1]) }}</span>
            </div>
            <div class="w-px h-6 bg-white/10"></div>
            <div class="text-gray-400 font-pixel text-xl tracking-wide flex items-center gap-3">
                <span>BIOME</span>
                <div class="flex items-center gap-2 text-white">
                    <span class="w-2 h-2 rounded-full bg-status-green shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                    <span class="biome-name-cjk">{{ cursorBiomeName }}</span>
                </div>
            </div>
        </div>
    </div>

    <div class="top">
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
    <!-- <Transition>
        <div class="zoom-hint" v-if="needs_zoom">
            <span class="material-symbols-outlined">warning</span>
            {{ i18n.t('map.zoom_hint') }}
        </div>
    </Transition> -->

    <!-- 自訂標記面板 - TP 下方 -->
    <div class="absolute right-6 top-20 z-[500]">
        <MarkersPanel ref="markersPanelRef" @goto="gotoPosition" class="markers-panel-map" />
    </div>

    <!-- 控制面板：縮放按鈕組 + Reset View -->
    <div class="absolute bottom-6 right-6 z-[500] flex flex-col gap-3">
        <!-- 縮放按鈕組 -->
        <div class="glass-panel p-1 flex flex-col gap-1 bg-surface-dark/90">
            <button
                @click="handleZoomIn"
                :disabled="!canZoomIn"
                class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 border border-transparent hover:border-white/20"
                :class="{ 'opacity-50 cursor-not-allowed': !canZoomIn }"
            >
                <span class="material-symbols-outlined text-2xl">add</span>
            </button>
            <div class="h-0.5 bg-white/10 w-full"></div>
            <button
                @click="handleZoomOut"
                :disabled="!canZoomOut"
                class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 border border-transparent hover:border-white/20"
                :class="{ 'opacity-50 cursor-not-allowed': !canZoomOut }"
            >
                <span class="material-symbols-outlined text-2xl">remove</span>
            </button>
        </div>
        <!-- Reset View 獨立按鈕 -->
        <button
            @click="handleResetView"
            :disabled="!canReset"
            class="glass-panel w-12 h-12 flex items-center justify-center text-white hover:bg-white/10 group"
            :class="{ 'opacity-50 cursor-not-allowed': !canReset }"
        >
            <span class="material-symbols-outlined text-3xl text-red-500 group-hover:animate-pulse">explore</span>
        </button>
    </div>
    </div>
</template>

<style scoped>
.map-wrapper {
    width: 100%;
    height: 100%;
    flex-grow: 1;
    position: relative;
}

#map_container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
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




.top{
    position: absolute;
    z-index: 500;
    left: 50%;
    transform: translateX(-50%);
    top: 5rem; /* 移到維度標籤下方 */
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

.zoom-hint {
    position: absolute;
    z-index: 500;
    left: 50%;
    transform: translateX(-50%);
    top: 5.5rem;
    padding: 0.4rem 1rem;
    border-radius: 0.5rem;
    background-color: rgba(180, 120, 30, 0.95);
    color: #fff;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.zoom-hint .material-symbols-outlined {
    font-size: 1.2rem;
    color: #ffe066;
}

</style>

<style>
/* 用戶標記樣式 (non-scoped) */
.user-marker-icon {
    background: transparent !important;
    border: none !important;
}
</style>
