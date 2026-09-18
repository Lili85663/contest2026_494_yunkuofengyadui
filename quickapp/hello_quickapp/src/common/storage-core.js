import { fresh, validateState, restoreState } from './focusPlan'
// Keep v1 records untouched; old automatic focus counts have different semantics.
export const KEY = 'wrist-rhythm-v3'
// A dependency-injected wrapper lets tests cover actual storage ordering/errors.
export function createStore(storage) {
  let queue = Promise.resolve()
  return {
    load() {
      return new Promise((resolve, reject) => storage.get({
        key: KEY, default: '',
        success(text) {
          try { resolve(text ? restoreState(JSON.parse(text)) : fresh()) }
          catch (e) { reject(e) }
        },
        fail(data, code) { reject(new Error('读取失败 ' + code)) }
      }))
    },
    save(state) {
      const value = JSON.stringify(validateState(state))
      const job = () => new Promise((resolve, reject) => storage.set({
        key: KEY, value,
        success() { resolve() },
        fail(data, code) { reject(new Error('保存失败 ' + code)) }
      }))
      const current = queue.then(job)
      queue = current.catch(() => {})
      return current
    }
  }
}
