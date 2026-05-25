import RangeDateWithPreset from './RangeDateWithPreset.jsx'

function toInputDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function toMonthDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${month}-${day}`
}

function toRangeDateValue(value) {
  const startDate = parseDateValue(value.startDate)
  const endDate = parseDateValue(value.endDate)

  if (!startDate || !endDate) {
    return []
  }

  return [
    {
      start: toMonthDay(startDate),
      end: toMonthDay(endDate),
      year: startDate.getFullYear(),
    },
  ]
}

function fromRangeDateValue(range) {
  const startDate = parseDateValue(`${range.year}-${range.start}`)
  const endDate = parseDateValue(`${range.year}-${range.end}`)

  if (!startDate || !endDate) {
    return {
      startDate: '',
      endDate: '',
    }
  }

  return {
    startDate: toInputDate(startDate),
    endDate: toInputDate(endDate),
  }
}

function RangeDate({
  value = {},
  onChange,
  onApply,
  onClear,
  onClose,
  hideTrigger = false,
  openPickerSignal = 0,
}) {
  const rangeDates = toRangeDateValue(value)

  const handleAddRange = (range) => {
    onChange?.(fromRangeDateValue(range))
    onApply?.()
  }

  const handleClear = () => {
    onClear?.()
  }

  return (
    <RangeDateWithPreset
      rangeDates={rangeDates}
      onAddRange={handleAddRange}
      onRemoveRange={handleClear}
      onClear={handleClear}
      onCancel={onClose}
      onClose={onClose}
      showTitle={!hideTrigger}
      showSummary={false}
      allowReplaceExistingRange
      hideTrigger={hideTrigger}
      openPickerSignal={openPickerSignal}
    />
  )
}

export default RangeDate
