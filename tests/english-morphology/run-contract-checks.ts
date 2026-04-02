import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

function repoRoot(): string {
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
}

function readSource(relativePath: string): string {
    return fs.readFileSync(path.join(repoRoot(), relativePath), 'utf8')
}

function requireMatch(source: string, pattern: RegExp, message: string): void {
    assert.match(source, pattern, message)
}

const resolverSource = readSource('src/core/morphology-language-resolver.ts')
const matcherSource = readSource('src/core/word-matcher-service.ts')
const addWordSource = readSource('src/ui/add-word-language-policy.ts')
const settingsSource = readSource('src/ui/settings-vocabulary-books.ts')
const unifiedSource = readSource('src/core/unified-morphology-service.ts')
const typesSource = readSource('src/utils/types.ts')
const morphologyTypesSource = readSource('src/core/morphology-types.ts')
const controllerSource = readSource('src/core/vocabulary-morphology-controller.ts')
const i18nIndexSource = readSource('src/i18n/index.ts')
const assetManagerSource = readSource('src/core/morphology-asset-manager.ts')
const settingsTabSource = readSource('src/ui/settings-tab.ts')
const englishInflectionSource = readSource('src/utils/english-inflection-generator.ts')
const mainSource = readSource('main.ts')
const vocabularyManagerSource = readSource('src/core/vocabulary-manager.ts')

requireMatch(typesSource, /export type MorphologyLanguage = 'none' \| 'korean' \| 'japanese' \| 'english' \| 'auto'/, 'english must be added to MorphologyLanguage')
requireMatch(morphologyTypesSource, /export type MorphologyDetectionLanguage = 'korean' \| 'japanese' \| 'english' \| 'unknown'/, 'english must be added to MorphologyDetectionLanguage')
requireMatch(morphologyTypesSource, /\| 'external-resource';/, 'morphology candidate source must include external-resource')
requireMatch(i18nIndexSource, /morphology_english\?: string;/, 'i18n language pack type should expose optional english morphology label')
requireMatch(resolverSource, /if \(languagePolicy === 'korean' \|\| languagePolicy === 'japanese' \|\| languagePolicy === 'english'\) \{\s*return languagePolicy/s, 'explicit english policy must short-circuit detection')
requireMatch(matcherSource, /if \(morphologyLang === 'english'\) \{\s*return generateEnglishInflections\(baseWord\);\s*\}/s, 'matcher must generate english inflections under explicit english policy')
requireMatch(matcherSource, /if \(morphologyLang === 'english'\) \{\s*return true;\s*\}/s, 'english generated fallback must remain explicit-policy-only and always enabled')
requireMatch(addWordSource, /languagePolicy === 'english' \|\| \^\[A-Za-z\]\[A-Za-z' -\]\*\$|languagePolicy === 'english' \|\| \/\^\[A-Za-z\]\[A-Za-z' -\]\*\$\//, 'add-word english placeholder should respect explicit english policy')
requireMatch(settingsSource, /\.addOption\('english', t\('settings\.morphology_english'\) \|\| '英语（强绑定）'\)/, 'settings dropdown must expose english language policy')
requireMatch(unifiedSource, /if \(targetLanguage === 'english'\) \{[\s\S]*setEnglishMorphologyAssetData\(englishAssetData \?\? null\)[\s\S]*analyzeEnglishWord\(word\)/, 'unified service must hydrate english external asset data before english analysis')
requireMatch(unifiedSource, /else if \(targetLanguage === 'english'\) \{\s*\/\/ v1: English document morphology index is intentionally deferred\./s, 'english document morphology deferral must stay explicit')
requireMatch(controllerSource, /language: 'korean' \| 'japanese' \| 'english' \| 'unknown' = 'unknown'/, 'vocabulary morphology controller must accept english queue requests')
requireMatch(assetManagerSource, /export type MorphologyAssetLanguage = 'korean' \| 'japanese' \| 'english'/, 'english must be added to morphology asset language union')
requireMatch(assetManagerSource, /getEnglishMorphologyAssetData\?\(\): Promise<EnglishMorphologyAssetData \| null>/, 'asset provider must expose optional english asset loader')
requireMatch(assetManagerSource, /english: \{[\s\S]*english-morphology-irregulars\.v1\.json[\s\S]*assetType: 'json'/, 'english asset descriptor must use JSON cache lane')
requireMatch(assetManagerSource, /downloadUrl: `https:\/\/cdn\.jsdelivr\.net\/gh\/HenMie\/HiWords@\$\{__HIWORDS_GIT_COMMIT__\}\/assets\/english-morphology\/english-morphology-irregulars\.v1\.json`/, 'english asset URL must be pinned to immutable git commit')
requireMatch(assetManagerSource, /const MAX_JSON_BYTE_LENGTH = 512 \* 1024/, 'english asset JSON should enforce a size cap')
requireMatch(settingsTabSource, /this\.addMorphologyAssetItem\('english'\)/, 'settings morphology asset section must expose english resource entry')
requireMatch(englishInflectionSource, /export function setEnglishMorphologyAssetData\(data: EnglishMorphologyAssetData \| null\): void/, 'english inflection module must accept external asset hydration')
requireMatch(englishInflectionSource, /const AMBIGUOUS_EXTERNAL_REVERSE_REJECTS = new Set\(\['better', 'best', 'more', 'most'\]\)/, 'english external asset lane must keep comparative ambiguity rejects')
requireMatch(vocabularyManagerSource, /async handleMorphologyAssetChange\(language: MorphologyAssetLanguage\): Promise<void> \{[\s\S]*updateServices\(this\.settings\.vocabularyBooks\)[\s\S]*clearMorphologyDecisionCache\(\)[\s\S]*invalidateMatcherSnapshot\(`morphology-asset:/, 'vocabulary manager must refresh morphology runtime and matcher snapshot after asset changes')
requireMatch(mainSource, /public async downloadMorphologyAsset\(language: MorphologyAssetLanguage\): Promise<MorphologyAssetState> \{[\s\S]*handleMorphologyAssetChange\(language\)[\s\S]*refreshHighlighter\(\)[\s\S]*return state;/, 'downloading morphology asset must refresh runtime state and highlights')
requireMatch(mainSource, /public async deleteMorphologyAsset\(language: MorphologyAssetLanguage\): Promise<void> \{[\s\S]*handleMorphologyAssetChange\(language\)[\s\S]*refreshHighlighter\(\)/, 'deleting morphology asset must refresh runtime state and highlights')

console.log('PASS english-contract-checks')
