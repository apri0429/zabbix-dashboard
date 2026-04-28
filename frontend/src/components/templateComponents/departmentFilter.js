import { useSyncExternalStore } from 'react'

export const ALL_DEPARTMENTS_FILTER_ID = 'all'
export const ALL_DEPARTMENTS_FILTER_LABEL = 'All Departements'

const STORAGE_KEY = 'dashboard-it.selected-department-id'
const DEPARTMENTS_UPDATED_EVENT = 'dashboard-it:departments-updated'

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null
  }

  const normalizedValue = String(value).trim()

  return normalizedValue || null
}

function canUseWindow() {
  return typeof window !== 'undefined'
}

export function normalizeDepartmentFilterId(value) {
  return normalizeOptionalText(value) ?? ALL_DEPARTMENTS_FILTER_ID
}

function readStoredDepartmentFilterId() {
  if (!canUseWindow()) {
    return ALL_DEPARTMENTS_FILTER_ID
  }

  return normalizeDepartmentFilterId(window.localStorage.getItem(STORAGE_KEY))
}

let selectedDepartmentFilterId = readStoredDepartmentFilterId()
const selectionListeners = new Set()

function emitSelectionChange() {
  selectionListeners.forEach((listener) => {
    listener()
  })
}

function subscribeToSelection(listener) {
  selectionListeners.add(listener)

  return () => {
    selectionListeners.delete(listener)
  }
}

function getSelectionSnapshot() {
  return selectedDepartmentFilterId
}

export function useSelectedDepartmentFilterId() {
  return useSyncExternalStore(
    subscribeToSelection,
    getSelectionSnapshot,
    () => ALL_DEPARTMENTS_FILTER_ID,
  )
}

export function isAllDepartmentsFilter(value) {
  return normalizeDepartmentFilterId(value) === ALL_DEPARTMENTS_FILTER_ID
}

export function setSelectedDepartmentFilterId(value) {
  const nextDepartmentFilterId = normalizeDepartmentFilterId(value)

  if (selectedDepartmentFilterId === nextDepartmentFilterId) {
    return
  }

  selectedDepartmentFilterId = nextDepartmentFilterId

  if (canUseWindow()) {
    if (nextDepartmentFilterId === ALL_DEPARTMENTS_FILTER_ID) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, nextDepartmentFilterId)
    }
  }

  emitSelectionChange()
}

export function resetSelectedDepartmentFilterId() {
  setSelectedDepartmentFilterId(ALL_DEPARTMENTS_FILTER_ID)
}

export function matchesDepartmentFilter(value, selectedDepartmentId) {
  if (isAllDepartmentsFilter(selectedDepartmentId)) {
    return true
  }

  return normalizeOptionalText(value) === normalizeOptionalText(selectedDepartmentId)
}

export function getDepartmentFilterOptions(departments = []) {
  const items = [
    {
      id: ALL_DEPARTMENTS_FILTER_ID,
      label: ALL_DEPARTMENTS_FILTER_LABEL,
    },
  ]

  departments.forEach((department) => {
    const departmentId = normalizeOptionalText(department?.departmentId ?? department?.id)

    if (!departmentId) {
      return
    }

    items.push({
      id: departmentId,
      label: normalizeOptionalText(department?.name) ?? 'Untitled Department',
    })
  })

  return items
}

export function getSelectedDepartmentFilterLabel(
  departments = [],
  selectedDepartmentId = ALL_DEPARTMENTS_FILTER_ID,
) {
  const activeOption =
    getDepartmentFilterOptions(departments).find((option) =>
      matchesDepartmentFilter(option.id, selectedDepartmentId),
    ) ?? null

  return activeOption?.label ?? ALL_DEPARTMENTS_FILTER_LABEL
}

export function subscribeToDepartmentCatalogUpdates(listener) {
  if (!canUseWindow()) {
    return () => {}
  }

  const handleCatalogUpdate = () => {
    listener()
  }

  window.addEventListener(DEPARTMENTS_UPDATED_EVENT, handleCatalogUpdate)

  return () => {
    window.removeEventListener(DEPARTMENTS_UPDATED_EVENT, handleCatalogUpdate)
  }
}

export function notifyDepartmentCatalogUpdated() {
  if (!canUseWindow()) {
    return
  }

  window.dispatchEvent(new Event(DEPARTMENTS_UPDATED_EVENT))
}
