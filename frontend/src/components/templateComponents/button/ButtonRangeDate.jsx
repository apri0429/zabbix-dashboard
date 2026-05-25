import { useEffect, useMemo, useState } from 'react'

import RangeDate from '../datepicker/RangeDate.jsx'
import { Calendar01, ChevronDown } from '../template/TemplateIcons.jsx'

function parseDateValue(value) {
  const [year, month, day] = String(value).split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

function formatDate(value) {
  const date = parseDateValue(value)

  if (!date) {
    return ''
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function ButtonRangeDate({ label = 'Tanggal', className = '', onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openPickerSignal, setOpenPickerSignal] = useState(0)
  const [range, setRange] = useState({
    startDate: '',
    endDate: '',
  })

  const rangeLabel = useMemo(() => {
    if (!range.startDate || !range.endDate) {
      return 'Pilih tanggal'
    }

    return `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`
  }, [range.endDate, range.startDate])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    setOpenPickerSignal((currentSignal) => currentSignal + 1)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleRangeChange = (nextRange) => {
    setRange(nextRange)
    onChange?.(nextRange)
  }

  const handleClear = () => {
    const emptyRange = {
      startDate: '',
      endDate: '',
    }

    handleRangeChange(emptyRange)
  }

  const handleOpenPicker = () => {
    setIsOpen(true)
  }

  return (
    <div className={['range-date-button', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={`range-date-button__trigger${isOpen ? ' range-date-button__trigger--open' : ''}`}
        onClick={handleOpenPicker}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Calendar01 size={18} aria-hidden="true" />

        <span className="range-date-button__copy">
          <span className="range-date-button__label">{label}</span>
          <span className="range-date-button__value">{rangeLabel}</span>
        </span>

        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`range-date-button__chevron${isOpen ? ' range-date-button__chevron--open' : ''}`}
        />
      </button>

      {isOpen ? (
        <RangeDate
          value={range}
          onChange={handleRangeChange}
          onApply={() => setIsOpen(false)}
          onClear={handleClear}
          onClose={() => setIsOpen(false)}
          hideTrigger
          openPickerSignal={openPickerSignal}
        />
      ) : null}
    </div>
  )
}

export default ButtonRangeDate
