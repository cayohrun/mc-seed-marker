import { Climate, DensityFunction, Identifier, lerp, NoiseRouter, NoiseSettings, WorldgenRegistries } from "deepslate"
import { ResourceLocation } from "mc-datapack-loader"
import { SpawnTarget } from "./util/SpawnTarget.js"

export function lerpClimate(a: Climate.TargetPoint, b: Climate.TargetPoint, c: number) {
	return new Climate.TargetPoint(
		lerp(c, a.temperature, b.temperature),
		lerp(c, a.humidity, b.humidity),
		lerp(c, a.continentalness, b.continentalness),
		lerp(c, a.erosion, b.erosion),
		lerp(c, a.depth, b.depth),
		lerp(c, a.weirdness, b.weirdness)
	)
}

export function lerp2Climate(a: Climate.TargetPoint, b: Climate.TargetPoint, c: Climate.TargetPoint, d: Climate.TargetPoint, e: number, f: number) {
	return lerpClimate(lerpClimate(a, b, e), lerpClimate(c, d, e), f)
}


function idIfExists(id: Identifier) {
	if (WorldgenRegistries.DENSITY_FUNCTION.has(id))
		return id
	return undefined
}

function getDimensionDensityFunction(name: string, noise_settings_id: Identifier, dimension_id: Identifier): Identifier {
	const dimensionName = dimension_id.path.split("/").reverse()[0]
	const noiseSettingsPath = noise_settings_id.path.split("/")
	noiseSettingsPath[noiseSettingsPath.length - 1] = `${dimensionName}_${noiseSettingsPath[noiseSettingsPath.length - 1]}`
	return new Identifier(noise_settings_id.namespace, noiseSettingsPath.join("/") + "/" + name)
}

export function getCustomDensityFunction(name: string, noise_settings_id: Identifier, dimension_id: Identifier): Identifier | undefined {
	return idIfExists(new Identifier(noise_settings_id.namespace, noise_settings_id.path + "/" + name))
		?? idIfExists(getDimensionDensityFunction(name, noise_settings_id, dimension_id))
		?? idIfExists(new Identifier(noise_settings_id.namespace, name))
		?? idIfExists(new Identifier("minecraft", name))
}

/**
 * 簡化版 Hillshade - 完全按照 cubiomes-viewer 的實現
 *
 * cubiomes world.cpp:
 *   d0 = t[0][1] + t[1][0]  // North + West
 *   d1 = t[1][2] + t[2][1]  // East + South
 *   light = 1.0 + (d1 - d0) * 0.25 / scale
 *
 * 西北光源效果：當地形向東南傾斜時 (d1 > d0)，光照增強
 *
 * @param hN 北方高度
 * @param hS 南方高度
 * @param hE 東方高度
 * @param hW 西方高度
 * @param scale 縮放因子
 * @param invert 反轉光照方向（用於座標系與 cubiomes 方向相反時）
 */
export function calculateHillshadeSimple(hN: number, hS: number, hE: number, hW: number, scale: number, invert = false): number {
	const d0 = hN + hW;  // 西北
	const d1 = hS + hE;  // 東南
	const mul = 0.25 / scale;

	const delta = invert ? (d0 - d1) : (d1 - d0);
	let light = 1.0 + delta * mul;

	if (light < 0.5) light = 0.5;
	if (light > 1.5) light = 1.5;

	return light;
}

// 保留舊函數以防需要
export function calculateHillshade(slope_x: number, slope_z: number, scale: number): number {
	return calculateHillshadeSimple(0, slope_z, slope_x, 0, scale);
}

/**
 * 雙線性插值 - 用於平滑 surface 高度
 * @param grid 二維數組（需有 padding，索引從 0 開始）
 * @param x 浮點數 x 座標（0 到 gridSize-1）
 * @param z 浮點數 z 座標（0 到 gridSize-1）
 * @param getValue 獲取網格值的函數
 */
export function bilinearInterpolate(
	grid: { surface: number }[][],
	x: number,
	z: number
): number {
	const x0 = Math.floor(x)
	const z0 = Math.floor(z)
	const x1 = x0 + 1
	const z1 = z0 + 1
	const fx = x - x0
	const fz = z - z0

	// 確保索引在有效範圍內（grid 已有 +1 padding）
	const v00 = grid[x0 + 1]?.[z0 + 1]?.surface ?? 0
	const v10 = grid[x1 + 1]?.[z0 + 1]?.surface ?? v00
	const v01 = grid[x0 + 1]?.[z1 + 1]?.surface ?? v00
	const v11 = grid[x1 + 1]?.[z1 + 1]?.surface ?? v00

	// 雙線性插值公式
	return v00 * (1 - fx) * (1 - fz)
		+ v10 * fx * (1 - fz)
		+ v01 * (1 - fx) * fz
		+ v11 * fx * fz
}

/**
 * 計算單個像素的平滑 hillshade
 * @param px 像素 x 座標 (0-255)
 * @param pz 像素 z 座標 (0-255)
 * @param grid surface 高度網格 (64x64 + padding)
 * @param scale 像素到網格的比例 (通常為 4)
 * @param step 世界座標步長
 */
export function calculateSmoothHillshade(
	px: number,
	pz: number,
	grid: { surface: number }[][],
	scale: number,
	step: number
): number {
	// 將像素座標轉換為網格座標
	const gx = px / scale
	const gz = pz / scale

	// 用插值獲取當前和鄰近點的高度
	const hE = bilinearInterpolate(grid, gx + 0.5 / scale, gz)
	const hW = bilinearInterpolate(grid, gx - 0.5 / scale, gz)
	const hS = bilinearInterpolate(grid, gx, gz + 0.5 / scale)
	const hN = bilinearInterpolate(grid, gx, gz - 0.5 / scale)

	// 計算坡度（使用中心差分）
	const slope_x = hE - hW
	const slope_z = hS - hN

	// 使用現有的 hillshade 計算
	return calculateHillshade(slope_x, slope_z, step / scale)
}

export function hashCode(str: string) {
	let hash = 0;
	for (let i = 0, len = str.length; i < len; i++) {
		let chr = str.charCodeAt(i);
		hash = (hash << 5) - hash + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
}

const MAX_LONG = BigInt("0x8000000000000000") // 2^63

export function parseSeed(input: string): bigint {
    if (/^[+-]?\d+$/.test(input)) {
        const value = BigInt(input)
        if (value >= -MAX_LONG && value < MAX_LONG) {
            return value
        }
    }   
    //String hashCode() function from Java
    //https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
    var hash = 0, i, chr;
    if (input.length === 0) return BigInt(0);
    for (i = 0; i < input.length; i++) {
        chr = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return BigInt(hash);
}

export function updateUrlParam(param: string, value?: string, default_value?: string) {
    const uri = window.location.search.substring(1)
    const params = new URLSearchParams(uri)
	if (value && value !== default_value) {
		params.set(param, value)
	} else {
		params.delete(param)
	}
    history.replaceState({}, "", "?" + decodeURIComponent(params.toString()))
}


type Metadata = {
	vanillaDatapack: string,
	datapackFormat: number,
	canonicalNames: string[],
	resourceLocations: {
		structure: ResourceLocation
	},
	biomes: {
		cherry_grove: string,
		pale_garden_1: string,
		pale_garden_2: string
	}
	experimentalDatapacks: {
		url: string,
		translation_key: string
	}[],
	spawnAlgorithm: SpawnTarget.Algorithm,
	dimensionPaddingEnabled: boolean
}

export const versionMetadata: { [version: string]: Metadata } = {
	"1_19": {
		vanillaDatapack: "1_19",
		experimentalDatapacks: [
			{
				url: "1_19_update_1_20",
				translation_key: "dropdown.add.built_in.update_1_20"
			}
		],
		datapackFormat: 12,
		canonicalNames: ["1.19", "1.19.1", "1.19.2", "1.19.3", "1.19.4"],
		resourceLocations: {
			structure: ResourceLocation.LEGACY_STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:meadow",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.LEGACY_ZERO_BIASED,
		dimensionPaddingEnabled: false
	},
	"1_20": {
		vanillaDatapack: "1_20",
		experimentalDatapacks: [],
		datapackFormat: 15,
		canonicalNames: ["1.20", "1.20.1"],
		resourceLocations: {
			structure: ResourceLocation.LEGACY_STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.LEGACY_ZERO_BIASED,
		dimensionPaddingEnabled: false
	},
	"1_20_2": {
		vanillaDatapack: "1_20_2",
		experimentalDatapacks: [],
		datapackFormat: 18,
		canonicalNames: ["1.20.2"],
		resourceLocations: {
			structure: ResourceLocation.LEGACY_STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.LEGACY_ZERO_BIASED,
		dimensionPaddingEnabled: false
	},
	"1_20_4": {
		vanillaDatapack: "1_20_4",
		experimentalDatapacks: [
			{
				url: "1_20_4_update_1_21",
				translation_key: "dropdown.add.built_in.update_1_21"
			}
		],
		datapackFormat: 26,
		canonicalNames: ["1.20.3", "1.20.4"],
		resourceLocations: {
			structure: ResourceLocation.LEGACY_STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.LEGACY_ZERO_BIASED,
		dimensionPaddingEnabled: false
	},
	"1_20_6": {
		vanillaDatapack: "1_20_6",
		experimentalDatapacks: [
			{
				url: "1_20_6_update_1_21",
				translation_key: "dropdown.add.built_in.update_1_21"
			}
		],
		datapackFormat: 41,
		canonicalNames: ["1.20.5", "1.20.6"],
		resourceLocations: {
			structure: ResourceLocation.LEGACY_STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.LEGACY_ZERO_BIASED,
		dimensionPaddingEnabled: false
	},
	"1_21_1": {
		vanillaDatapack: "1_21",
		experimentalDatapacks: [],
		datapackFormat: 48,
		canonicalNames: ["1.21", "1.21.1"],
		resourceLocations: {
			structure: ResourceLocation.STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.LEGACY_ZERO_BIASED,
		dimensionPaddingEnabled: false
	},
	"1_21_3": {
		vanillaDatapack: "1_21_3",
		experimentalDatapacks: [
			{
				"url": "1_21_3_winter_drop",
				"translation_key": "dropdown.add.built_in.winter_drop"
			}
		],
		datapackFormat: 57,
		canonicalNames: ["1.21.2", "1.21.3"],
		resourceLocations: {
			structure: ResourceLocation.STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:dark_forest",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.BEST_CLIMATE,
		dimensionPaddingEnabled: false
	},
	"1_21_4": {
		vanillaDatapack: "1_21_4",
		experimentalDatapacks: [],
		datapackFormat: 61,
		canonicalNames: ["1.21.4"],
		resourceLocations: {
			structure: ResourceLocation.STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:pale_garden",
			pale_garden_2: "minecraft:dark_forest"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.BEST_CLIMATE,
		dimensionPaddingEnabled: true
	},
	"1_21_5": {
		vanillaDatapack: "1_21_5",
		experimentalDatapacks: [],
		datapackFormat: 71,
		canonicalNames: ["1.21.5"],
		resourceLocations: {
			structure: ResourceLocation.STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:pale_garden",
			pale_garden_2: "minecraft:pale_garden"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.BEST_CLIMATE,
		dimensionPaddingEnabled: true
	},
	"1_21_7": {
		vanillaDatapack: "1_21_7",
		experimentalDatapacks: [],
		datapackFormat: 81,
		canonicalNames: ["1.21.6", "1.21.7"],
		resourceLocations: {
			structure: ResourceLocation.STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:pale_garden",
			pale_garden_2: "minecraft:pale_garden"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.BEST_CLIMATE,
		dimensionPaddingEnabled: true
	},
	"1_21_11": {
		vanillaDatapack: "1_21_7",  // 暫用 1.21.7 的 datapack，worldgen 應相同
		experimentalDatapacks: [],
		datapackFormat: 81,
		canonicalNames: ["1.21.8", "1.21.9", "1.21.10", "1.21.11"],
		resourceLocations: {
			structure: ResourceLocation.STRUCTURE
		},
		biomes: {
			cherry_grove: "minecraft:cherry_grove",
			pale_garden_1: "minecraft:pale_garden",
			pale_garden_2: "minecraft:pale_garden"
		},
		spawnAlgorithm: SpawnTarget.Algorithm.BEST_CLIMATE,
		dimensionPaddingEnabled: true
	},
}
