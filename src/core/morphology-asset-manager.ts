import type { App, DataAdapter } from 'obsidian'
import type { EnglishMorphologyAssetData } from '../utils'
import { parseEnglishMorphologyAssetData } from '../utils'

declare const __LINDERA_WASM_KO_VERSION__: string
declare const __LINDERA_WASM_JA_VERSION__: string
declare const __HIWORDS_GIT_COMMIT__: string

export type MorphologyAssetLanguage = 'korean' | 'japanese' | 'english'
type WasmMorphologyAssetLanguage = Exclude<MorphologyAssetLanguage, 'english'>

export interface MorphologyAssetProvider {
    getWasmBytes(language: WasmMorphologyAssetLanguage): Promise<ArrayBuffer>
    getEnglishMorphologyAssetData?(): Promise<EnglishMorphologyAssetData | null>
}

export interface MorphologyAssetState {
    language: MorphologyAssetLanguage
    downloaded: boolean
    byteLength: number
    cachePath: string
    downloadUrl: string
    isDownloading: boolean
}

interface MorphologyAssetDescriptor {
    cacheFileName: string
    downloadUrl: string
    assetType: 'wasm' | 'json'
}

const MORPHOLOGY_ASSET_DIR = 'morphology-assets'
const MIN_WASM_BYTE_LENGTH = 1024
const MAX_JSON_BYTE_LENGTH = 512 * 1024
const WASM_MAGIC_HEADER = [0x00, 0x61, 0x73, 0x6d] as const

const MORPHOLOGY_ASSETS: Record<MorphologyAssetLanguage, MorphologyAssetDescriptor> = {
    korean: {
        cacheFileName: 'lindera-ko.wasm',
        downloadUrl: `https://cdn.jsdelivr.net/npm/lindera-wasm-ko-dic@${__LINDERA_WASM_KO_VERSION__}/lindera_wasm_bg.wasm`,
        assetType: 'wasm'
    },
    japanese: {
        cacheFileName: 'lindera-ja.wasm',
        downloadUrl: `https://cdn.jsdelivr.net/npm/lindera-wasm-ipadic@${__LINDERA_WASM_JA_VERSION__}/lindera_wasm_bg.wasm`,
        assetType: 'wasm'
    },
    english: {
        cacheFileName: 'english-morphology-irregulars.v1.json',
        downloadUrl: `https://cdn.jsdelivr.net/gh/HenMie/HiWords@${__HIWORDS_GIT_COMMIT__}/assets/english-morphology/english-morphology-irregulars.v1.json`,
        assetType: 'json'
    }
}

export class MorphologyAssetManager implements MorphologyAssetProvider {
    private readonly adapter: DataAdapter
    private readonly assetRootPath: string
    private readonly inFlightDownloads = new Map<MorphologyAssetLanguage, Promise<ArrayBuffer | EnglishMorphologyAssetData | null>>()

    constructor(app: App, pluginId: string) {
        this.adapter = app.vault.adapter
        this.assetRootPath = `${app.vault.configDir}/plugins/${pluginId}/${MORPHOLOGY_ASSET_DIR}`
    }

    public async getWasmBytes(language: WasmMorphologyAssetLanguage): Promise<ArrayBuffer> {
        const descriptor = MORPHOLOGY_ASSETS[language]
        if (descriptor.assetType !== 'wasm') {
            throw new Error(`不支持以 WASM 方式读取 ${language} 资源`)
        }

        const existingTask = this.inFlightDownloads.get(language)
        if (existingTask) {
            const result = await existingTask
            if (result instanceof ArrayBuffer) {
                return result
            }
        }

        const task = this.loadWasmBytes(language)
        this.inFlightDownloads.set(language, task)

        try {
            const result = await task
            if (!(result instanceof ArrayBuffer)) {
                throw new Error(`${language} WASM 资源返回了无效结果`)
            }
            return result
        } finally {
            this.inFlightDownloads.delete(language)
        }
    }

    public async getEnglishMorphologyAssetData(): Promise<EnglishMorphologyAssetData | null> {
        const descriptor = MORPHOLOGY_ASSETS.english
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`
        const parsed = await this.readCachedEnglishMorphologyAssetData(cachePath)
        if (!parsed) {
            return null
        }
        return {
            schemaVersion: parsed.schemaVersion,
            source: parsed.source,
            counts: parsed.counts,
            verbs: parsed.verbs,
            nouns: parsed.nouns,
            adjectives: parsed.adjectives
        }
    }

    public async getAssetState(language: MorphologyAssetLanguage): Promise<MorphologyAssetState> {
        const descriptor = MORPHOLOGY_ASSETS[language]
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`

        if (descriptor.assetType === 'wasm') {
            const stat = await this.adapter.stat(cachePath)
            const hasCandidateCache = !!stat && stat.size >= MIN_WASM_BYTE_LENGTH
            let downloaded = false
            let byteLength = 0

            if (hasCandidateCache) {
                const cachedBytes = await this.readCachedBytes(cachePath, { logInvalidCache: false })
                if (cachedBytes) {
                    downloaded = true
                    byteLength = cachedBytes.byteLength
                }
            }

            return {
                language,
                downloaded,
                byteLength,
                cachePath,
                downloadUrl: descriptor.downloadUrl,
                isDownloading: this.inFlightDownloads.has(language)
            }
        }

        const cachedData = await this.readCachedEnglishMorphologyAssetData(cachePath, { logInvalidCache: false, includeByteLength: true })
        return {
            language,
            downloaded: !!cachedData,
            byteLength: cachedData?.byteLength ?? 0,
            cachePath,
            downloadUrl: descriptor.downloadUrl,
            isDownloading: this.inFlightDownloads.has(language)
        }
    }

    public async downloadAsset(language: MorphologyAssetLanguage): Promise<MorphologyAssetState> {
        if (language === 'english') {
            await this.downloadEnglishMorphologyAssetData()
            return this.getAssetState(language)
        }

        await this.getWasmBytes(language)
        return this.getAssetState(language)
    }

    public async deleteAsset(language: MorphologyAssetLanguage): Promise<void> {
        const descriptor = MORPHOLOGY_ASSETS[language]
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`

        if (this.inFlightDownloads.has(language)) {
            throw new Error(`当前 ${language} 资源正在下载，请稍后再删除`)
        }

        if (!(await this.adapter.exists(cachePath))) {
            return
        }

        await this.adapter.remove(cachePath)
    }

    private async loadWasmBytes(language: WasmMorphologyAssetLanguage): Promise<ArrayBuffer> {
        const descriptor = MORPHOLOGY_ASSETS[language]
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`

        const cachedBytes = await this.readCachedBytes(cachePath)
        if (cachedBytes) {
            return cachedBytes
        }

        const downloadedBytes = await this.downloadBytes(language, descriptor.downloadUrl)
        await this.persistBinaryCache(cachePath, downloadedBytes)
        return downloadedBytes
    }

    private async downloadEnglishMorphologyAssetData(): Promise<EnglishMorphologyAssetData> {
        const existingTask = this.inFlightDownloads.get('english')
        if (existingTask) {
            const result = await existingTask
            if (result && !(result instanceof ArrayBuffer)) {
                return result
            }
        }

        const task = this.loadEnglishMorphologyAssetData()
        this.inFlightDownloads.set('english', task)

        try {
            const result = await task
            if (!result) {
                throw new Error('下载的英语形态学资源无效')
            }
            return result
        } finally {
            this.inFlightDownloads.delete('english')
        }
    }

    private async loadEnglishMorphologyAssetData(): Promise<EnglishMorphologyAssetData> {
        const descriptor = MORPHOLOGY_ASSETS.english
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`
        const downloadedText = await this.downloadText('english', descriptor.downloadUrl)
        const parsed = parseEnglishMorphologyAssetData(downloadedText)
        if (!parsed) {
            throw new Error(`下载的 english 形态学资源无效: ${descriptor.downloadUrl}`)
        }
        await this.persistTextCache(cachePath, downloadedText)
        return parsed
    }

    private async readCachedBytes(
        cachePath: string,
        options?: { logInvalidCache?: boolean }
    ): Promise<ArrayBuffer | null> {
        const exists = await this.adapter.exists(cachePath)
        if (!exists) {
            return null
        }

        const cachedBytes = await this.adapter.readBinary(cachePath)
        if (this.isValidWasm(cachedBytes)) {
            return cachedBytes
        }

        if (options?.logInvalidCache !== false) {
            console.warn(`[HiWords] 发现损坏的形态学缓存，已忽略: ${cachePath}`)
        }
        return null
    }

    private async readCachedEnglishMorphologyAssetData(
        cachePath: string,
        options?: { logInvalidCache?: boolean; includeByteLength?: boolean }
    ): Promise<(EnglishMorphologyAssetData & { byteLength?: number }) | null> {
        const exists = await this.adapter.exists(cachePath)
        if (!exists) {
            return null
        }

        const cachedText = await this.adapter.read(cachePath)
        const parsed = parseEnglishMorphologyAssetData(cachedText)
        if (parsed) {
            const byteLength = options?.includeByteLength
                ? new TextEncoder().encode(cachedText).byteLength
                : undefined
            return {
                ...parsed,
                byteLength
            }
        }

        if (options?.logInvalidCache !== false) {
            console.warn(`[HiWords] 发现损坏的英语形态学缓存，已忽略: ${cachePath}`)
        }
        return null
    }

    private async downloadBytes(language: WasmMorphologyAssetLanguage, downloadUrl: string): Promise<ArrayBuffer> {
        const response = await fetch(downloadUrl)
        if (!response.ok) {
            throw new Error(`下载 ${language} 形态学资源失败 (HTTP ${response.status}): ${downloadUrl}`)
        }

        const downloadedBytes = await response.arrayBuffer()
        if (!this.isValidWasm(downloadedBytes)) {
            throw new Error(`下载的 ${language} 形态学资源无效: ${downloadUrl}`)
        }

        return downloadedBytes
    }

    private async downloadText(language: 'english', downloadUrl: string): Promise<string> {
        const response = await fetch(downloadUrl)
        if (!response.ok) {
            throw new Error(`下载 ${language} 形态学资源失败 (HTTP ${response.status}): ${downloadUrl}`)
        }

        const text = await response.text()
        const byteLength = new TextEncoder().encode(text).byteLength
        if (byteLength > MAX_JSON_BYTE_LENGTH) {
            throw new Error(`下载的 ${language} 形态学资源过大 (${byteLength} bytes): ${downloadUrl}`)
        }

        return text
    }

    private async persistBinaryCache(cachePath: string, bytes: ArrayBuffer): Promise<void> {
        await this.ensureDirectoryPath(this.assetRootPath)
        await this.adapter.writeBinary(cachePath, bytes)
    }

    private async persistTextCache(cachePath: string, text: string): Promise<void> {
        await this.ensureDirectoryPath(this.assetRootPath)
        await this.adapter.write(cachePath, text)
    }

    private async ensureDirectoryPath(path: string): Promise<void> {
        const segments = path.split('/').filter(Boolean)
        let currentPath = ''

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment
            if (await this.adapter.exists(currentPath)) {
                continue
            }
            try {
                await this.adapter.mkdir(currentPath)
            } catch (error) {
                if (!(await this.adapter.exists(currentPath))) {
                    throw error
                }
            }
        }
    }

    private isValidWasm(bytes: ArrayBuffer): boolean {
        if (bytes.byteLength < MIN_WASM_BYTE_LENGTH) {
            return false
        }

        const header = new Uint8Array(bytes, 0, WASM_MAGIC_HEADER.length)
        return WASM_MAGIC_HEADER.every((value, index) => header[index] === value)
    }
}
