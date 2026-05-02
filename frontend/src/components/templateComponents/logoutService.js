import { clearAuthSession } from './authStorage.js'

export const LOGOUT_REDIRECT_URL = 'https://pilargroup.id'

function redirectToPilarGroup() {
  if (typeof window === 'undefined') {
    return
  }

  clearAuthSession()
  window.location.assign(LOGOUT_REDIRECT_URL)
}

export async function submitLogout() {
  redirectToPilarGroup()
  return null
}

const logoutService = {
  submitLogout,
}

export default logoutService
