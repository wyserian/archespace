/**
 * MoveSpacesDialog.jsx - Move spaces, with everything in them, into another
 * space or out to the dashboard. A space's own sub-spaces, and the place it
 * already is, aren't offered.
 *
 * @param {{ ids: string[], spaces: Array, move: object, onClose: () => void,
 *   onDone?: () => void }} props
 *   `spaces` are all the active spaces; `move` is useSpaces().move.
 */
import { useToast } from '../../context/ToastCore'
import { descendantsOf, moveDestinations } from '../../lib/spaceTree'
import { Modal } from '../ui/UI'
import { buttonClass } from '../ui/buttonStyles'
import { SpaceDestinations } from './SpaceDestinations'

export function MoveSpacesDialog({ ids, spaces, move, onClose, onDone }) {
  const { toast } = useToast()
  const moving = spaces.filter(s => ids.includes(s.id))
  const parents = new Set(moving.map(s => s.parent_id ?? null))
  const here = parents.size === 1 ? [...parents][0] : undefined
  const exclude = new Set([...ids, ...descendantsOf(ids, spaces), ...(here ? [here] : [])])
  const top = here === null ? null : { hint: 'Top level' }
  const nothingElse = !top && moveDestinations(spaces, exclude).length === 0
  const title = moving.length === 1
    ? `Move "${moving[0].name || 'Untitled'}"`
    : `Move ${moving.length} spaces`

  const pick = (parentId, name) => move.mutate({ ids, parentId }, {
    onSuccess: () => {
      toast.success(`Moved ${moving.length === 1 ? 'space' : `${moving.length} spaces`} to ${name}`)
      onDone?.()
      onClose()
    },
    onError: () => toast.error("Couldn't move the space."),
  })

  return (
    <Modal title={title} onClose={onClose}>
      {nothingElse ? (
        <div className="space-y-4">
          <p className="text-text-secondary text-sm leading-relaxed">
            There's nowhere else to move it yet. Create another space first.
          </p>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', className: 'w-full' })}>
            Close
          </button>
        </div>
      ) : (
        <SpaceDestinations spaces={spaces} exclude={exclude} top={top} onPick={pick} disabled={move.isPending} />
      )}
    </Modal>
  )
}
