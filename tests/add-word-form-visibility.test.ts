import * as assert from 'node:assert/strict'

import { shouldShowColorField } from '../src/ui/add-word-form-visibility'

assert.equal(shouldShowColorField(false, 'group'), false, 'group mode add flow should hide color field')
assert.equal(shouldShowColorField(false, 'color'), true, 'color mode add flow should show color field')
assert.equal(shouldShowColorField(true, 'group'), true, 'edit flow should preserve color field in group mode')
assert.equal(shouldShowColorField(true, 'color'), true, 'edit flow should preserve color field in color mode')

console.log('PASS add-word-form-visibility')
