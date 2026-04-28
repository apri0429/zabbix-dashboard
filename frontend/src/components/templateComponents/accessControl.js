import {
  defaultNavigationPath,
  implementedNavigationPaths,
  primaryNavigationItems,
  secondaryNavigationItems,
} from './navigation.js'
import { getStoredUser } from './authStorage.js'

const IT_DEPARTMENT_ALIASES = [
  'it',
  'information technology',
  'department it',
  'departement it',
  'it department',
]
const LOGOUT_PATH = '/logout'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeSlug(value) {
  return normalizeText(value).toLowerCase()
}

export function normalizeAccessUser(user = getStoredUser()) {
  const sourceUser = user && typeof user === 'object' ? user : {}
  const department = normalizeText(
    sourceUser.department ??
      sourceUser.division ??
      sourceUser.department_name ??
      sourceUser.departmentName,
  )
  const apps = Array.isArray(sourceUser.apps)
    ? Array.from(new Set(sourceUser.apps.map((app) => normalizeSlug(app)).filter(Boolean)))
    : []

  return {
    ...sourceUser,
    department,
    apps,
    isIT: IT_DEPARTMENT_ALIASES.includes(normalizeSlug(department)),
  }
}

export function isITUser(user = getStoredUser()) {
  return normalizeAccessUser(user).isIT
}

export function getAllowedNavigationPaths(user = getStoredUser()) {
  if (isITUser(user)) {
    return implementedNavigationPaths
  }

  return [defaultNavigationPath]
}

export function canAccessPath(path, user = getStoredUser()) {
  return getAllowedNavigationPaths(user).includes(path)
}

export function getPrimaryNavigationItemsForUser(user = getStoredUser()) {
  if (isITUser(user)) {
    return primaryNavigationItems
  }

  return primaryNavigationItems.filter((item) => item.href === defaultNavigationPath)
}

export function getSecondaryNavigationItemsForUser(user = getStoredUser()) {
  if (isITUser(user)) {
    return secondaryNavigationItems
  }

  return secondaryNavigationItems.flatMap((item) => {
    if (item.href === LOGOUT_PATH) {
      return [item]
    }

    if (item.id !== 'settings') {
      return []
    }

    const allowedChildren = (item.children ?? []).filter(
      (child) => child.id === 'change-profile',
    )

    if (allowedChildren.length === 0) {
      return []
    }

    return [
      {
        ...item,
        children: allowedChildren,
      },
    ]
  })
}

export function canAccessProject(project, user = getStoredUser()) {
  const accessUser = normalizeAccessUser(user)

  if (accessUser.isIT) {
    return true
  }

  const projectSlug = normalizeSlug(project?.slug ?? project?.raw?.slug)

  if (!projectSlug || projectSlug === 'no-slug') {
    return false
  }

  return accessUser.apps.includes(projectSlug)
}

export function filterProjectsForUser(projects, user = getStoredUser()) {
  if (!Array.isArray(projects)) {
    return []
  }

  if (isITUser(user)) {
    return projects
  }

  return projects.filter((project) => canAccessProject(project, user))
}
