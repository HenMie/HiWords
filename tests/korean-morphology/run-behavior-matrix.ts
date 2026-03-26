import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { runVerificationSuite } = require('./harness.ts') as typeof import('./harness')

const matrixPath = process.argv[2]

try {
    const summary = runVerificationSuite(matrixPath)
    console.log('Korean morphology verification matrix')
    console.log(`Matrix file: ${summary.matrixPath}`)
    console.log(`Cases: ${summary.matrix.cases.length}`)

    for (const result of summary.results) {
        const status = result.passed ? 'PASS' : 'FAIL'
        const suffix = result.details ? ` - ${result.details}` : ''
        console.log(`${status} ${result.name}${suffix}`)
        if (!result.passed) {
            process.exitCode = 1
        }
    }
} catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`FAIL verification-harness - ${message}`)
    process.exitCode = 1
}
