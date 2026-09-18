// All time is supplied by the caller so the exact production logic is testable.
export const MINUTE = 60000
export function fresh() { return { schemaVersion: 3, plan: null, currentModule: null, records: [], healthBlocked: false, aiHealthEnabled: true } }
export function dateKey(now) { const d = new Date(now); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) }
export function checkInput(goal, minutes) {
  return typeof goal === 'string' && goal.trim().length > 0 && goal.trim().length <= 120 && Number.isInteger(minutes) && minutes >= 5 && minutes <= 180
}
export function validModules(items, total) {
  return Array.isArray(items) && items.length >= 1 && items.length <= 4 && items.every(x => x && typeof x.title === 'string' && x.title.trim().length > 0 && x.title.length <= 40 && typeof x.task === 'string' && x.task.trim().length > 0 && x.task.length <= 240 && Number.isInteger(x.minutes) && x.minutes >= 1) && items.reduce((n, x) => n + x.minutes, 0) === total
}
export function canReplace(s) { return !s.plan || ['planned', 'completed', 'cancelled'].indexOf(s.plan.status) >= 0 }
export function makePlan(s, goal, minutes, modules, source, now) {
  if (!checkInput(goal, minutes) || !validModules(modules, minutes) || !canReplace(s)) return false
  const id = 'plan-' + now + '-' + Math.random().toString(36).slice(2, 9)
  s.plan = { id, goal: goal.trim(), totalMinutes: minutes, source, moduleIndex: 0, status: 'planned', modules: modules.map((x, i) => ({ id: id + '-' + i, title: x.title.trim(), minutes: x.minutes, task: x.task.trim() })) }
  s.currentModule = null
  return true
}
function status(s, value) { s.currentModule.status = value; s.plan.status = value }
export function startModule(s, now) {
  if (!s.plan || s.healthBlocked) return false
  if (s.plan.status !== 'planned' && s.plan.status !== 'between_modules') return false
  const x = s.plan.modules[s.plan.moduleIndex]
  s.currentModule = { id: x.id, status: 'running', remainingMs: x.minutes * MINUTE, accumulatedMs: 0, startAt: now, endAt: now + x.minutes * MINUTE, nextActivityAtMs: 2 * MINUTE, activityPrompt: false, restRemainingMs: 0, restEndAt: 0, pauseMode: 'learning', result: null }
  s.plan.status = 'running'; return true
}
function accrue(s, now) {
  const m = s.currentModule
  const delta = Math.min(m.remainingMs, Math.max(0, now - m.startAt))
  m.accumulatedMs += delta; m.remainingMs -= delta; m.startAt = now; m.endAt = now + m.remainingMs
}
export function tick(s, now) {
  const m = s.currentModule
  if (!m) return false
  if (m.status === 'resting') {
    if (now < m.restEndAt) return false
    m.restRemainingMs = 0
    if (s.healthBlocked) { m.pauseMode = 'learning'; status(s, 'paused') }
    else { m.startAt = now; m.endAt = now + m.remainingMs; status(s, 'running') }
    return true
  }
  if (m.status !== 'running') return false
  // Expiration wins over the activity checkpoint; late callbacks never add overtime.
  if (now >= m.endAt) { accrue(s, now); m.activityPrompt = false; status(s, 'awaiting_result'); return true }
  const elapsed = m.accumulatedMs + Math.max(0, now - m.startAt)
  if (elapsed >= m.nextActivityAtMs) {
    // Keep one visible choice; do not stack missed reminders after a delayed tick.
    m.nextActivityAtMs = (Math.floor(elapsed / (2 * MINUTE)) + 1) * 2 * MINUTE
    m.activityPrompt = true; return true
  }
  return false
}
export function pause(s, now) {
  const transitioned = tick(s, now)
  const m = s.currentModule
  if (!m) return false
  if (m.status === 'running') { accrue(s, now); m.pauseMode = 'learning' }
  else if (m.status === 'resting') { m.restRemainingMs = Math.max(0, m.restEndAt - now); m.pauseMode = 'rest' }
  else return transitioned
  status(s, 'paused'); return true
}
export function resume(s, now) {
  const m = s.currentModule
  if (!m || m.status !== 'paused' || s.healthBlocked) return false
  if (m.pauseMode === 'rest' && m.restRemainingMs > 0) { m.restEndAt = now + m.restRemainingMs; status(s, 'resting') }
  else { m.startAt = now; m.endAt = now + m.remainingMs; status(s, 'running') }
  return true
}
export function activity(s, now, takeRest) {
  tick(s, now)
  const m = s.currentModule
  if (!m || m.status !== 'running' || s.healthBlocked) return false
  m.activityPrompt = false
  if (takeRest) { accrue(s, now); m.restRemainingMs = MINUTE; m.restEndAt = now + MINUTE; status(s, 'resting') }
  return true
}
export function finishEarly(s, now) {
  const transitioned = tick(s, now)
  const m = s.currentModule
  if (!m || ['running', 'paused', 'resting'].indexOf(m.status) < 0) return transitioned
  if (m.status === 'running') accrue(s, now)
  m.activityPrompt = false; status(s, 'awaiting_result'); return true
}
export function confirmResult(s, completed, now) {
  const m = s.currentModule
  if (!m || m.status !== 'awaiting_result' || s.records.some(r => r.id === m.id)) return false
  m.result = completed ? 'completed' : 'incomplete'
  s.records.push({ id: m.id, planId: s.plan.id, title: s.plan.modules[s.plan.moduleIndex].title, completed: !!completed, actualMs: m.accumulatedMs, day: dateKey(now), confirmedAt: now })
  m.status = 'recorded'
  s.plan.moduleIndex++
  s.plan.status = s.plan.moduleIndex >= s.plan.modules.length ? 'completed' : 'between_modules'
  return true
}
export function blockHealth(s, now) {
  // Set the lock before tick: a rest expiring in this same callback cannot restart.
  const changed = !s.healthBlocked
  s.healthBlocked = true
  const paused = pause(s, now)
  if (s.currentModule) s.currentModule.activityPrompt = false
  return changed || paused
}
export function unlockHealth(s, health) {
  if (!s.healthBlocked || !health || !health.canRecover) return false
  s.healthBlocked = false; return true
}
export function remaining(s, now) {
  const m = s.currentModule
  if (!m || m.status === 'recorded' || m.status === 'awaiting_result') return 0
  if (m.status === 'resting') return Math.max(0, m.restEndAt - now)
  if (m.status === 'paused') return m.pauseMode === 'rest' ? m.restRemainingMs : m.remainingMs
  return Math.max(0, m.endAt - now)
}
export function displayTime(ms) { const seconds = Math.ceil(ms / 1000); return Math.floor(seconds / 60) + ':' + ('0' + seconds % 60).slice(-2) }
export function totals(s, now) {
  const rows = s.records.filter(r => r.day === dateKey(now))
  return { count: rows.filter(r => r.completed).length, minutes: Math.floor(rows.reduce((n, r) => n + r.actualMs, 0) / MINUTE) }
}
export function checkpoint(s, now) {
  const m = s.currentModule
  if (m && m.status === 'running') accrue(s, Math.min(now, m.endAt))
  if (m && m.status === 'resting') m.restRemainingMs = Math.max(0, m.restEndAt - now)
}
export function validateState(s) {
  const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (!s || s.schemaVersion !== 3 || typeof s.healthBlocked !== 'boolean' || !Array.isArray(s.records)) throw new Error('记录格式错误，原记录未覆盖')
  if (typeof s.aiHealthEnabled !== 'boolean') s.aiHealthEnabled = true
  const ids = {}
  s.records.forEach(r => {
    if (!r || typeof r.id !== 'string' || ids[r.id] || !finite(r.actualMs) || typeof r.completed !== 'boolean' || typeof r.day !== 'string') throw new Error('统计记录损坏')
    ids[r.id] = true
  })
  if (s.plan) {
    const p = s.plan
    if (!checkInput(p.goal, p.totalMinutes) || !validModules(p.modules, p.totalMinutes) || !Number.isInteger(p.moduleIndex) || p.moduleIndex < 0 || p.moduleIndex > p.modules.length || ['planned', 'running', 'paused', 'resting', 'awaiting_result', 'between_modules', 'completed', 'cancelled'].indexOf(p.status) < 0) throw new Error('学习计划损坏')
    if (new Set(p.modules.map(x => x.id)).size !== p.modules.length || p.modules.some(x => typeof x.id !== 'string')) throw new Error('模块标识损坏')
  }
  if (s.currentModule) {
    const m = s.currentModule
    const item = s.plan && s.plan.modules.filter(x => x.id === m.id)[0]
    if (m.nextActivityAtMs === undefined) m.nextActivityAtMs = (Math.floor(m.accumulatedMs / (2 * MINUTE)) + 1) * 2 * MINUTE
    if (!finite(m.nextActivityAtMs) || m.nextActivityAtMs < 2 * MINUTE) throw new Error('活动提醒记录损坏')
    if (!item || ['running', 'paused', 'resting', 'awaiting_result', 'recorded'].indexOf(m.status) < 0 || !finite(m.remainingMs) || !finite(m.accumulatedMs) || !finite(m.startAt) || !finite(m.endAt) || !finite(m.restRemainingMs) || !finite(m.restEndAt) || m.remainingMs + m.accumulatedMs !== item.minutes * MINUTE) throw new Error('计时记录损坏')
  }
  return s
}
export function restoreState(s) {
  validateState(s)
  // Never infer off-screen learning/health monitoring from a wall-clock gap.
  const m = s.currentModule
  if (m && (m.status === 'running' || m.status === 'resting')) {
    m.pauseMode = m.status === 'resting' ? 'rest' : 'learning'; status(s, 'paused')
  }
  return s
}
