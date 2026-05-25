import CreateButton from '../button/CreateButton.jsx'
import DataTable from './DataTable.jsx'

export {
  DataTableChips,
  DataTableIdentity,
  DataTableStatus,
} from './DataTable.jsx'

function DataTableAction({
  columns = [],
  actions = [],
  actionColumnLabel = 'Action',
  actionColumnKey = 'action',
  actionCellClassName = 'users-table__action-cell',
  actionCellStyle = { width: '1%', whiteSpace: 'nowrap' },
  ...props
}) {
  const actionColumn =
    actions.length > 0
      ? {
          key: actionColumnKey,
          header: actionColumnLabel,
          headerClassName: 'users-table__action-header',
          cellClassName: actionCellClassName,
          cellStyle: actionCellStyle,
          render: (row, index) => (
            <div className="users-table__action-group">
              {actions.map((action) => {
                if (action.hidden?.(row, index)) {
                  return null
                }

                const Icon = action.icon
                const buttonLabel = action.label ?? action.key ?? 'Action'

                return (
                  <CreateButton
                    key={action.key ?? buttonLabel}
                    variant="icon"
                    tone={action.variant === 'danger' ? 'danger' : 'default'}
                    type="button"
                    disabled={action.disabled?.(row, index) ?? action.disabled}
                    aria-label={buttonLabel}
                    title={buttonLabel}
                    onClick={(event) => {
                      event.stopPropagation()
                      action.onClick?.(row, index, event)
                    }}
                  >
                    {Icon ? <Icon size={16} aria-hidden="true" /> : buttonLabel}
                  </CreateButton>
                )
              })}
            </div>
          ),
        }
      : null

  return (
    <DataTable
      {...props}
      columns={actionColumn ? [...columns, actionColumn] : columns}
    />
  )
}

export default DataTableAction
