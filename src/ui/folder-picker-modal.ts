import { FuzzySuggestModal, TFolder } from 'obsidian'
import type { App } from 'obsidian'
import { t } from '../i18n'

const ROOT_FOLDER_SENTINEL = '__hiwords-root-folder__'

type FolderPickerItem = TFolder | typeof ROOT_FOLDER_SENTINEL

export class FolderPickerModal extends FuzzySuggestModal<FolderPickerItem> {
    private items: FolderPickerItem[]
    private onChoose: (folderPath: string) => void

    constructor(app: App, onChoose: (folderPath: string) => void) {
        super(app)
        this.items = [
            ROOT_FOLDER_SENTINEL,
            ...this.app.vault.getAllFolders().sort((left, right) => left.path.localeCompare(right.path))
        ]
        this.onChoose = onChoose
        this.titleEl.setText(t('modals.export_pick_folder_title') || 'Choose export folder')
        this.setPlaceholder(t('modals.export_folder_placeholder') || 'Select a vault folder')
        this.setInstructions([
            { command: '↑↓', purpose: t('modals.export_folder_picker_navigate') || 'Navigate' },
            { command: '↵', purpose: t('modals.export_folder_picker_choose') || 'Choose folder' },
            { command: 'esc', purpose: t('modals.cancel_button') || 'Cancel' }
        ])
        this.emptyStateText = t('modals.export_folder_picker_empty_state') || 'No folders found'
    }

    getItems(): FolderPickerItem[] {
        return this.items
    }

    getItemText(item: FolderPickerItem): string {
        if (item === ROOT_FOLDER_SENTINEL) {
            return '/'
        }

        return item.path || '/'
    }

    onChooseItem(item: FolderPickerItem): void {
        this.onChoose(item === ROOT_FOLDER_SENTINEL ? '' : item.path)
    }
}
