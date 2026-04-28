import { clearAuthSession } from './authStorage.js'

export const LOGIN_PATH = '/login'

function redirectToLogin() {
  if (typeof window === 'undefined') {
    return
  }

  clearAuthSession()

  if (window.location.pathname !== LOGIN_PATH) {
    window.history.replaceState({}, '', LOGIN_PATH)
  }

  window.dispatchEvent(new PopStateEvent('popstate'))
}

export async function submitLogout() {
  redirectToLogin()
  return null
}

const logoutService = {
  submitLogout,
}

export default logoutService
