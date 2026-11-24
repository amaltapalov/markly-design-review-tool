// Esc precedence (plan default): dialog > keyboard mask > pending capture > recording > draft > edit >
// keyboard picking > exit review mode.

/**
 * @typedef {object} EscState
 * @property {boolean} dialogOpen
 * @property {null | 'requesting' | 'countdown' | 'recording' | 'processing' | 'ready' | 'shooting'} capture
 * @property {boolean} hasDraft
 * @property {boolean} draftDirty
 * @property {boolean} [editing]
 * @property {boolean} [editDirty]
 * @property {boolean} [maskEditing]  a keyboard mask box is being placed in the capture review
 * @property {boolean} [picking]      keyboard element picker is active
 */

/**
 * @param {EscState} s
 * @returns {'close-dialog' | 'cancel-capture' | 'stop-recording' | 'ignore' | 'confirm-discard' | 'discard-draft' | 'confirm-discard-edit' | 'cancel-edit' | 'cancel-mask' | 'cancel-pick' | 'exit'}
 */
export function escAction(s) {
  if (s.dialogOpen) return 'close-dialog';
  if (s.maskEditing) return 'cancel-mask';
  if (s.capture === 'countdown' || s.capture === 'requesting') return 'cancel-capture';
  if (s.capture === 'recording') return 'stop-recording';
  if (s.capture === 'processing' || s.capture === 'shooting') return 'ignore';
  if (s.hasDraft) return s.draftDirty ? 'confirm-discard' : 'discard-draft';
  if (s.editing) return s.editDirty ? 'confirm-discard-edit' : 'cancel-edit';
  if (s.picking) return 'cancel-pick';
  return 'exit';
}
