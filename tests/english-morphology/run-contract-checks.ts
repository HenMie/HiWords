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

requireMatch(typesSource, /export type MorphologyLanguage = 'none' \| 'korean' \| 'japanese' \| 'english' \| 'auto'/, 'english must be added to MorphologyLanguage')
requireMatch(morphologyTypesSource, /export type MorphologyDetectionLanguage = 'korean' \| 'japanese' \| 'english' \| 'unknown'/, 'english must be added to MorphologyDetectionLanguage')
requireMatch(i18nIndexSource, /morphology_english\?: string;/, 'i18n language pack type should expose optional english morphology label')
requireMatch(resolverSource, /if \(languagePolicy === 'korean' \|\| languagePolicy === 'japanese' \|\| languagePolicy === 'english'\) \{\s*return languagePolicy/s, 'explicit english policy must short-circuit detection')
requireMatch(matcherSource, /if \(morphologyLang === 'english'\) \{\s*return generateEnglishInflections\(baseWord\);\s*\}/s, 'matcher must generate english inflections under explicit english policy')
requireMatch(matcherSource, /if \(morphologyLang === 'english'\) \{\s*return true;\s*\}/s, 'english generated fallback must remain explicit-policy-only and always enabled in v1')
requireMatch(addWordSource, /languagePolicy === 'english' \|\| \^\[A-Za-z\]\[A-Za-z' -\]\*\$|languagePolicy === 'english' \|\| \/\^\[A-Za-z\]\[A-Za-z' -\]\*\$\//, 'add-word english placeholder should respect explicit english policy')
requireMatch(settingsSource, /\.addOption\('english', t\('settings\.morphology_english'\) \|\| '英语（强绑定）'\)/, 'settings dropdown must expose english language policy')
requireMatch(unifiedSource, /if \(targetLanguage === 'english'\) \{[\s\S]*analyzeEnglishWord\(word\)/, 'unified service must route english word analysis through english analyzer')
requireMatch(unifiedSource, /else if \(targetLanguage === 'english'\) \{\s*\/\/ v1: English document morphology index is intentionally deferred\./s, 'english document morphology deferral must stay explicit in v1')
requireMatch(controllerSource, /language: 'korean' \| 'japanese' \| 'english' \| 'unknown' = 'unknown'/, 'vocabulary morphology controller must accept english queue requests')

console.log('PASS english-contract-checks')
