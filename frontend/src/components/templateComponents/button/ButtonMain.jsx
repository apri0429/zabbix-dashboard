import { useState } from 'react'

import DialogAction from '../Dialog/DialogAction.jsx'
import { Users01 } from '../template/TemplateIcons.jsx'

function ButtonMain({ label = 'Tombol' }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="users-table-card__action"
        onClick={() => setIsDialogOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isDialogOpen}
      >
        <Users01 size={18} aria-hidden="true" />
        {label}
      </button>

      <DialogAction isOpen={isDialogOpen} title={label} onClose={() => setIsDialogOpen(false)} />
    </>
  )
}

export default ButtonMain
