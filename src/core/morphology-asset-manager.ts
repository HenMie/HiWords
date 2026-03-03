import type { App, DataAdapter } from 'obsidian';

declare const __LINDERA_WASM_KO_VERSION__: string;
declare const __LINDERA_WASM_JA_VERSION__: string;

export type MorphologyAssetLanguage = 'korean' | 'japanese';

export interface MorphologyAssetProvider {
    getWasmBytes(language: MorphologyAssetLanguage): Promise<ArrayBuffer>;
}

export interface MorphologyAssetState {
    language: MorphologyAssetLanguage;
    downloaded: boolean;
    byteLength: number;
    cachePath: string;
    downloadUrl: string;
    isDownloading: boolean;
}

interface MorphologyAssetDescriptor {
    cacheFileName: string;
    downloadUrl: string;
}

const MORPHOLOGY_ASSET_DIR = 'morphology-assets';
const MIN_WASM_BYTE_LENGTH = 1024;
const WASM_MAGIC_HEADER = [0x00, 0x61, 0x73, 0x6d] as const;

const MORPHOLOGY_ASSETS: Record<MorphologyAssetLanguage, MorphologyAssetDescriptor> = {
    korean: {
        cacheFileName: 'lindera-ko.wasm',
        downloadUrl: `https://cdn.jsdelivr.net/npm/lindera-wasm-ko-dic@${__LINDERA_WASM_KO_VERSION__}/lindera_wasm_bg.wasm`
    },
    japanese: {
        cacheFileName: 'lindera-ja.wasm',
        downloadUrl: `https://cdn.jsdelivr.net/npm/lindera-wasm-ipadic@${__LINDERA_WASM_JA_VERSION__}/lindera_wasm_bg.wasm`
    }
};

export class MorphologyAssetManager implements MorphologyAssetProvider {
    private readonly adapter: DataAdapter;
    private readonly assetRootPath: string;
    private readonly inFlightDownloads = new Map<MorphologyAssetLanguage, Promise<ArrayBuffer>>();

    constructor(app: App, pluginId: string) {
        this.adapter = app.vault.adapter;
        this.assetRootPath = `${app.vault.configDir}/plugins/${pluginId}/${MORPHOLOGY_ASSET_DIR}`;
    }

    public async getWasmBytes(language: MorphologyAssetLanguage): Promise<ArrayBuffer> {
        const existingTask = this.inFlightDownloads.get(language);
        if (existingTask) {
            return existingTask;
        }

        const task = this.loadWasmBytes(language);
        this.inFlightDownloads.set(language, task);

        try {
            return await task;
        } finally {
            this.inFlightDownloads.delete(language);
        }
    }

    public async getAssetState(language: MorphologyAssetLanguage): Promise<MorphologyAssetState> {
        const descriptor = MORPHOLOGY_ASSETS[language];
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`;
        const stat = await this.adapter.stat(cachePath);
        const hasCandidateCache = !!stat && stat.size >= MIN_WASM_BYTE_LENGTH;
        let downloaded = false;
        let byteLength = 0;

        if (hasCandidateCache) {
            const cachedBytes = await this.readCachedBytes(cachePath, { logInvalidCache: false });
            if (cachedBytes) {
                downloaded = true;
                byteLength = cachedBytes.byteLength;
            }
        }

        return {
            language,
            downloaded,
            byteLength,
            cachePath,
            downloadUrl: descriptor.downloadUrl,
            isDownloading: this.inFlightDownloads.has(language)
        };
    }

    public async downloadAsset(language: MorphologyAssetLanguage): Promise<MorphologyAssetState> {
        await this.getWasmBytes(language);
        return this.getAssetState(language);
    }

    public async deleteAsset(language: MorphologyAssetLanguage): Promise<void> {
        const descriptor = MORPHOLOGY_ASSETS[language];
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`;

        if (this.inFlightDownloads.has(language)) {
            throw new Error(`当前 ${language} 资源正在下载，请稍后再删除`);
        }

        if (!(await this.adapter.exists(cachePath))) {
            return;
        }

        await this.adapter.remove(cachePath);
    }

    private async loadWasmBytes(language: MorphologyAssetLanguage): Promise<ArrayBuffer> {
        const descriptor = MORPHOLOGY_ASSETS[language];
        const cachePath = `${this.assetRootPath}/${descriptor.cacheFileName}`;

        const cachedBytes = await this.readCachedBytes(cachePath);
        if (cachedBytes) {
            return cachedBytes;
        }

        const downloadedBytes = await this.downloadBytes(language, descriptor.downloadUrl);
        await this.persistCache(cachePath, downloadedBytes);
        return downloadedBytes;
    }

    private async readCachedBytes(
        cachePath: string,
        options?: { logInvalidCache?: boolean }
    ): Promise<ArrayBuffer | null> {
        const exists = await this.adapter.exists(cachePath);
        if (!exists) {
            return null;
        }

        const cachedBytes = await this.adapter.readBinary(cachePath);
        if (this.isValidWasm(cachedBytes)) {
            return cachedBytes;
        }

        if (options?.logInvalidCache !== false) {
            console.warn(`[HiWords] 发现损坏的形态学缓存，已忽略: ${cachePath}`);
        }
        return null;
    }

    private async downloadBytes(language: MorphologyAssetLanguage, downloadUrl: string): Promise<ArrayBuffer> {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`下载 ${language} 形态学资源失败 (HTTP ${response.status}): ${downloadUrl}`);
        }

        const downloadedBytes = await response.arrayBuffer();
        if (!this.isValidWasm(downloadedBytes)) {
            throw new Error(`下载的 ${language} 形态学资源无效: ${downloadUrl}`);
        }

        return downloadedBytes;
    }

    private async persistCache(cachePath: string, bytes: ArrayBuffer): Promise<void> {
        await this.ensureDirectoryPath(this.assetRootPath);
        await this.adapter.writeBinary(cachePath, bytes);
    }

    private async ensureDirectoryPath(path: string): Promise<void> {
        const segments = path.split('/').filter(Boolean);
        let currentPath = '';

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            if (await this.adapter.exists(currentPath)) {
                continue;
            }
            try {
                await this.adapter.mkdir(currentPath);
            } catch (error) {
                if (!(await this.adapter.exists(currentPath))) {
                    throw error;
                }
            }
        }
    }

    private isValidWasm(bytes: ArrayBuffer): boolean {
        if (bytes.byteLength < MIN_WASM_BYTE_LENGTH) {
            return false;
        }

        const header = new Uint8Array(bytes, 0, WASM_MAGIC_HEADER.length);
        return WASM_MAGIC_HEADER.every((value, index) => header[index] === value);
    }
}
