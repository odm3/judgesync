import { nanoid } from 'nanoid'

const DEVICE_KEY = 'judgesync:device-id'

export function getDeviceId() {
  if (typeof window === 'undefined') return 'server-device'
  let id = window.localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = nanoid(21)
    window.localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}
