import { Fragment, isValidElement, useState } from 'react'

import CreateButton from '../button/CreateButton.jsx'
import { ChevronDown } from '../template/TemplateIcons.jsx'

function getInitials(value = '') {
  return String(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function getDefaultRowId(row, index) {
  return row?.id ?? row?.userId ?? row?.key ?? index
}

function normalizeList(items) {
  if (!Array.isArray(items)) {
    return []
  }

  return items.map((item) => String(item).trim()).filter(Boolean)
}

function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-') || 'row'
}

function resolveTemplateValue(value, row, index) {
  return typeof value === 'function' ? value(row, index) : value
}

function normalizePageSizeOptions(options, pageSize) {
  const normalizedOptions = (Array.isArray(options) ? options : [])
    .map((option) => Number(option))
    .filter((option) => Number.isInteger(option) && option > 0)
  const normalizedPageSize = Number(pageSize)

  if (
    Number.isInteger(normalizedPageSize) &&
    normalizedPageSize > 0 &&
    !normalizedOptions.includes(normalizedPageSize)
  ) {
    return [normalizedPageSize, ...normalizedOptions]
  }

  return normalizedOptions
}

function getColumnValue(column, row, index) {
  if (typeof column.render === 'function') {
    return column.render(row, index)
  }

  if (typeof column.accessor === 'function') {
    return column.accessor(row, index)
  }

  if (typeof column.accessor === 'string') {
    return row?.[column.accessor]
  }

  if (column.key) {
    return row?.[column.key]
  }

  return null
}

function renderBasicValue(value) {
  if (isValidElement(value)) {
    return value
  }

  if (Array.isArray(value)) {
    return <DataTableChips items={value} />
  }

  if (value === null) {
    return <span className="users-table__detail-value users-table__detail-value--muted">null</span>
  }

  if (value === undefined || value === '') {
    return <span className="users-table__detail-value users-table__detail-value--muted">-</span>
  }

  return value
}

function renderDetailValue(value) {
  if (isValidElement(value)) {
    return value
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="users-table__detail-value users-table__detail-value--mono">[]</span>
    }

    return (
      <div className="users-table__detail-chips">
        {value.map((item, index) => (
          <span className="users-table__detail-chip" key={`${item}-${index}`}>
            {item}
          </span>
        ))}
      </div>
    )
  }

  if (value === null) {
    return <span className="users-table__detail-value users-table__detail-value--muted">null</span>
  }

  if (value === undefined || value === '') {
    return <span className="users-table__detail-value users-table__detail-value--muted">-</span>
  }

  return (
    <span
      className={`users-table__detail-value${
        typeof value === 'number' ? ' users-table__detail-value--mono' : ''
      }`}
    >
      {String(value)}
    </span>
  )
}

function getDetailSections(detail, row, index) {
  if (!detail) {
    return []
  }

  if (typeof detail.sections === 'function') {
    return detail.sections(row, index) ?? []
  }

  return detail.sections ?? []
}

export function DataTableStatus({
  children,
  variant = 'active',
  inline = false,
  className = '',
}) {
  const statusClassName = [
    'users-table__status',
    inline ? 'users-table__status--inline' : '',
    variant ? `users-table__status--${variant}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={statusClassName}>{children ?? '-'}</span>
}

export function DataTableChips({ items = [], empty = '-', variant = 'app', className = '' }) {
  const normalizedItems = normalizeList(items)

  if (normalizedItems.length === 0) {
    return <span className="users-table__apps-empty">{empty}</span>
  }

  return (
    <div className={['users-table__apps', className].filter(Boolean).join(' ')}>
      {normalizedItems.map((item, index) => (
        <DataTableStatus key={`${item}-${index}`} variant={variant} inline>
          {item}
        </DataTableStatus>
      ))}
    </div>
  )
}

export function DataTableIdentity({ title, subtitle, initials, badge, className = '' }) {
  return (
    <div className={['users-table__identity', className].filter(Boolean).join(' ')}>
      <span className="users-table__avatar">{initials || getInitials(title)}</span>

      <div className="users-table__identity-copy">
        <div className="users-table__name-row">
          <strong className="users-table__name">{title}</strong>
          {badge}
        </div>

        {subtitle ? <p className="users-table__meta">{subtitle}</p> : null}
      </div>
    </div>
  )
}

function DataTable({
  rows = [],
  columns = [],
  getRowId = getDefaultRowId,
  detail = null,
  actions = [],
  pagination = null,
  tableLabel = 'Data table',
  tableMessage = '',
  emptyMessage,
  idPrefix = 'data-table',
  className = '',
  onRowClick,
  getRowClassName,
}) {
  const [expandedRowKey, setExpandedRowKey] = useState(null)
  const hasDetail = Boolean(detail)
  const visibleExpandedRowKey = rows.some(
    (row, index) => String(getRowId(row, index)) === expandedRowKey,
  )
    ? expandedRowKey
    : null
  const resolvedEmptyMessage = emptyMessage ?? tableMessage ?? 'Belum ada data.'
  const colSpan = columns.length + (hasDetail ? 1 : 0)
  const currentPageSize = Number(pagination?.pageSize)
  const pageSizeOptions = normalizePageSizeOptions(pagination?.pageSizeOptions, currentPageSize)
  const canChangePageSize =
    typeof pagination?.onPageSizeChange === 'function' &&
    Number.isInteger(currentPageSize) &&
    currentPageSize > 0 &&
    pageSizeOptions.length > 0

  const handleToggleRow = (rowKey) => {
    if (!hasDetail) {
      return
    }

    setExpandedRowKey((currentRowKey) => (currentRowKey === rowKey ? null : rowKey))
  }

  const handleRowKeyDown = (event, rowKey) => {
    if (!hasDetail || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }

    event.preventDefault()
    handleToggleRow(rowKey)
  }

  const handleRowClick = (row, index, rowKey) => {
    onRowClick?.(row, index)
    handleToggleRow(rowKey)
  }

  const handlePageSizeChange = (event) => {
    const nextPageSize = Number(event.target.value)

    if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) {
      return
    }

    pagination.onPageSizeChange(nextPageSize)
  }

  return (
    <>
      <div className={['users-table-wrapper', className].filter(Boolean).join(' ')}>
        <table className="users-table" aria-label={tableLabel}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.headerClassName}
                  style={column.headerStyle}
                >
                  {column.header}
                </th>
              ))}

              {hasDetail ? (
                <th scope="col" className="users-table__detail-header">
                  {detail.columnLabel ?? 'Detail'}
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {rows.length > 0 ? (
              rows.map((row, index) => {
                const rowId = getRowId(row, index)
                const rowKey = String(rowId)
                const safeRowId = sanitizeId(rowKey)
                const isExpanded = visibleExpandedRowKey === rowKey
                const isRowInteractive = hasDetail || typeof onRowClick === 'function'
                const accordionId = `${idPrefix}-accordion-${safeRowId}`
                const detailSections = getDetailSections(detail, row, index)
                const detailTitle = resolveTemplateValue(detail?.title, row, index)
                const detailDescription = resolveTemplateValue(detail?.description, row, index)
                const detailEyebrow = resolveTemplateValue(detail?.eyebrow, row, index)
                const rowClassName = [
                  'users-table__row',
                  isRowInteractive ? 'users-table__row--interactive' : '',
                  isExpanded ? 'users-table__row--expanded' : '',
                  getRowClassName?.(row, index),
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={rowClassName}
                      onClick={
                        isRowInteractive ? () => handleRowClick(row, index, rowKey) : undefined
                      }
                      onKeyDown={(event) => handleRowKeyDown(event, rowKey)}
                      tabIndex={hasDetail ? 0 : undefined}
                      aria-expanded={hasDetail ? isExpanded : undefined}
                      aria-controls={hasDetail ? accordionId : undefined}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={column.cellClassName}
                          style={column.cellStyle}
                        >
                          {renderBasicValue(getColumnValue(column, row, index))}
                        </td>
                      ))}

                      {hasDetail ? (
                        <td className="users-table__detail-cell">
                          <CreateButton
                            variant="detail"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleToggleRow(rowKey)
                            }}
                            aria-expanded={isExpanded}
                            aria-controls={accordionId}
                            title={isExpanded ? 'Tutup detail' : 'Buka detail'}
                          >
                            <span>{detail.buttonLabel ?? 'Detail'}</span>
                            <ChevronDown
                              size={16}
                              aria-hidden="true"
                              className={`users-table__detail-icon${
                                isExpanded ? ' users-table__detail-icon--open' : ''
                              }`}
                            />
                          </CreateButton>
                        </td>
                      ) : null}
                    </tr>

                    {hasDetail && isExpanded ? (
                      <tr className="users-table__accordion-row">
                        <td colSpan={colSpan}>
                          <div className="users-table__accordion" id={accordionId}>
                            <div className="users-table__accordion-header">
                              <div className="users-table__accordion-copy">
                                <p className="users-table__accordion-eyebrow">
                                  {detailEyebrow ?? 'Detail'}
                                </p>
                                <h3 className="users-table__accordion-title">
                                  {detailTitle ?? row.name ?? row.title ?? rowId}
                                </h3>
                                {detailDescription ? (
                                  <p className="users-table__accordion-description">
                                    {detailDescription}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            {typeof detail.render === 'function' ? detail.render(row, index) : null}

                            {detailSections.length > 0 ? (
                              <div className="users-table__detail-shell">
                                {detailSections.map((section) => (
                                  <section
                                    key={section.title}
                                    className={`users-table__detail-section${
                                      section.wide ? ' users-table__detail-section--wide' : ''
                                    }`}
                                  >
                                    <div className="users-table__detail-section-header">
                                      <p className="users-table__detail-section-eyebrow">
                                        {section.title}
                                      </p>
                                    </div>

                                    <dl className="users-table__detail-list">
                                      {(section.fields ?? []).map((field) => {
                                        const fieldValue =
                                          typeof field.render === 'function'
                                            ? field.render(row, index)
                                            : resolveTemplateValue(field.value, row, index)

                                        return (
                                          <div
                                            key={field.label}
                                            className={`users-table__detail-row${
                                              field.kind === 'chips'
                                                ? ' users-table__detail-row--stacked'
                                                : ''
                                            }`}
                                          >
                                            <dt className="users-table__detail-label">
                                              {field.label}
                                            </dt>
                                            <dd className="users-table__detail-field">
                                              {renderDetailValue(fieldValue)}
                                            </dd>
                                          </div>
                                        )
                                      })}
                                    </dl>
                                  </section>
                                ))}
                              </div>
                            ) : null}

                            {actions.length > 0 ? (
                              <div className="users-table__accordion-actions">
                                {actions.map((action) => {
                                  if (action.hidden?.(row, index)) {
                                    return null
                                  }

                                  const Icon = action.icon

                                  return (
                                    <CreateButton
                                      key={action.key ?? action.label}
                                      variant="accordion"
                                      tone={action.variant === 'danger' ? 'danger' : 'default'}
                                      type="button"
                                      disabled={action.disabled?.(row, index) ?? action.disabled}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        action.onClick?.(row, index, event)
                                      }}
                                    >
                                      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                                      {action.label}
                                    </CreateButton>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            ) : (
              <tr>
                <td colSpan={colSpan}>
                  <div className="users-table__empty">{resolvedEmptyMessage}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <div className="users-table-pagination">
          <div className="users-table-pagination__meta">
            <p className="users-table-pagination__summary">{pagination.summary}</p>

            {canChangePageSize ? (
              <label className="users-table-pagination__page-size">
                <span>{pagination.pageSizeLabel ?? 'Tampilkan'}</span>
                <select
                  className="users-table-pagination__select"
                  value={currentPageSize}
                  onChange={handlePageSizeChange}
                  aria-label={pagination.pageSizeAriaLabel ?? 'Jumlah baris per halaman'}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span>{pagination.pageSizeSuffix ?? 'baris'}</span>
              </label>
            ) : null}
          </div>

          <div
            className="users-table-pagination__controls"
            aria-label={pagination.ariaLabel ?? `${tableLabel} pagination`}
          >
            <CreateButton
              variant="pagination"
              type="button"
              onClick={pagination.onPrevious}
              disabled={pagination.currentPage === 1}
            >
              {pagination.previousLabel ?? 'Previous'}
            </CreateButton>

            {(pagination.items ?? []).map((item, index) =>
              typeof item === 'number' ? (
                <CreateButton
                  key={item}
                  variant="pagination"
                  active={item === pagination.currentPage}
                  type="button"
                  onClick={() => pagination.onSelect?.(item)}
                  aria-current={item === pagination.currentPage ? 'page' : undefined}
                >
                  {item}
                </CreateButton>
              ) : (
                <span
                  key={`${item}-${index}`}
                  className="users-table-pagination__ellipsis"
                  aria-hidden="true"
                >
                  ...
                </span>
              ),
            )}

            <CreateButton
              variant="pagination"
              type="button"
              onClick={pagination.onNext}
              disabled={pagination.currentPage === pagination.totalPages}
            >
              {pagination.nextLabel ?? 'Next'}
            </CreateButton>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default DataTable
