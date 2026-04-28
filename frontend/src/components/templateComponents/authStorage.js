export const TOKEN_STORAGE_KEY = 'token'
export const USER_STORAGE_KEY = 'auth_user'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStorage(key) {
  if (!canUseStorage()) {
    return null
  }

  return window.localStorage.getItem(key)
}

function writeStorage(key, value) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, value)
}

function removeStorage(key) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(key)
}

function parseStoredJson(value) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function getToken() {
  return readStorage(TOKEN_STORAGE_KEY)
}

export function setToken(token) {
  if (!token) {
    removeStorage(TOKEN_STORAGE_KEY)
    return
  }

  writeStorage(TOKEN_STORAGE_KEY, token)
}

export function getStoredUser() {
  return parseStoredJson(readStorage(USER_STORAGE_KEY))
}

export function setStoredUser(user) {
  if (!user) {
    removeStorage(USER_STORAGE_KEY)
    return
  }

  writeStorage(USER_STORAGE_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  removeStorage(TOKEN_STORAGE_KEY)
  removeStorage(USER_STORAGE_KEY)
}

export function isAuthenticated() {
  return Boolean(getToken())
}
