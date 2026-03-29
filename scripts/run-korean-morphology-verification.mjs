import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const steps = [
  {
    name: 'behavior-matrix',
    command: process.execPath,
    args: ['--experimental-strip-types', 'tests/korean-morphology/run-behavior-matrix.ts']
  },
  {
    name: 'document-index-runtime',
    command: process.execPath,
    args: ['scripts/run-korean-document-index-runtime-test.mjs']
  },
  {
    name: 'lint-tests',
    command: 'npx',
    args: [
      'eslint',
      'tests/korean-morphology/harness.ts',
      'tests/korean-morphology/run-behavior-matrix.ts',
      'tests/korean-morphology/document-index-runtime.test.ts',
      'scripts/run-korean-document-index-runtime-test.mjs',
      'scripts/run-korean-morphology-verification.mjs'
    ]
  },
  {
    name: 'build',
    command: 'npm',
    args: ['run', 'build']
  }
]

for (const step of steps) {
  console.log(`\n== ${step.name} ==`)
  console.log(`$ ${step.command} ${step.args.join(' ')}`)
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    encoding: 'utf8'
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.status !== 0) {
    console.error(`Step failed: ${step.name} (exit ${result.status ?? 'null'})`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nAll Korean morphology verification steps passed.')
