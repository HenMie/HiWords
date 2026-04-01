import type { MasteredDetectionMode } from '../utils'

export function shouldShowColorField(
    isEditMode: boolean,
    masteredDetection: MasteredDetectionMode = 'group'
): boolean {
    return isEditMode || masteredDetection === 'color'
}
