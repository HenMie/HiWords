import esbuild from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const tempDir = mkdtempSync(path.join(tmpdir(), 'hiwords-korean-probe-'))
const entryPath = path.join(tempDir, 'probe.ts')
const bundlePath = path.join(tempDir, 'probe.bundle.mjs')

const source = `
import { KoreanMorphologyService } from ${JSON.stringify(path.join(repoRoot, 'src/core/korean-morphology-service.ts'))}
import type { NormalizedToken } from ${JSON.stringify(path.join(repoRoot, 'src/core/korean-morphology/types.ts'))}

function oldFirstTokenFallback(tokens: NormalizedToken[], originalWord: string) {
  const firstToken = tokens[0]
  if (!firstToken) return null
  return {
    surface: originalWord,
    baseForm: firstToken.baseForm,
    partOfSpeech: firstToken.partOfSpeech,
    confidence: 0.7,
    analysisSource: 'tokenizer'
  }
}

const cases: Array<{ name: string, originalWord: string, tokens: NormalizedToken[] }> = [
  {
    name: 'tokenizer-split-dagaowatda',
    originalWord: '다가왔습니다',
    tokens: [
      { surface: '다가', baseForm: '다가', partOfSpeech: 'NNG', features: [], rawToken: { surface: '다가', feature: [] } },
      { surface: '왔', baseForm: '오', partOfSpeech: 'VV', features: [], rawToken: { surface: '왔', feature: [] } },
      { surface: '습니다', baseForm: '습니다', partOfSpeech: 'EF', features: [], rawToken: { surface: '습니다', feature: [] } }
    ]
  },
  {
    name: 'tokenizer-split-dagawayo',
    originalWord: '다가와요',
    tokens: [
      { surface: '다가', baseForm: '다가', partOfSpeech: 'NNG', features: [], rawToken: { surface: '다가', feature: [] } },
      { surface: '와', baseForm: '오', partOfSpeech: 'VV', features: [], rawToken: { surface: '와', feature: [] } },
      { surface: '요', baseForm: '요', partOfSpeech: 'JX', features: [], rawToken: { surface: '요', feature: [] } }
    ]
  },
  {
    name: 'lemma-changing-auxiliary-still-blocked',
    originalWord: '읽어주다',
    tokens: [
      { surface: '읽', baseForm: '읽', partOfSpeech: 'VV', features: [], rawToken: { surface: '읽', feature: [] } },
      { surface: '어', baseForm: '어', partOfSpeech: 'EC', features: [], rawToken: { surface: '어', feature: [] } },
      { surface: '주', baseForm: '주', partOfSpeech: 'VX', features: [], rawToken: { surface: '주', feature: [] } },
      { surface: '다', baseForm: '다', partOfSpeech: 'EF', features: [], rawToken: { surface: '다', feature: [] } }
    ]
  }
]

const service = new KoreanMorphologyService(undefined, null)
const analyzeTokens = (service as any).analyzeTokens.bind(service)

for (const testCase of cases) {
  const before = oldFirstTokenFallback(testCase.tokens, testCase.originalWord)
  const after = analyzeTokens(testCase.tokens, testCase.originalWord)
  console.log(JSON.stringify({ name: testCase.name, before, after }, null, 2))
}
`

writeFileSync(entryPath, source)

try {
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent'
  })

  await import(pathToFileURL(bundlePath).href)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
