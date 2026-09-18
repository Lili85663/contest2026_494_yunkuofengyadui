// Configurable development thresholds, NOT medical standards. Stress excluded until units verified.
export const POLICY = { maxAgeMs: 30000, hrMin: 50, hrMax: 110, hrSevereLow: 40, hrSevereHigh: 140, spo2Min: 95, spo2Severe: 90 }
export function classifyHealth(samples, now, policy = POLICY) {
  const valid = (x, max) => x && typeof x.value === 'number' && Number.isFinite(x.value) && x.value > 0 && x.value <= max && typeof x.at === 'number' && x.at <= now && now - x.at <= policy.maxAgeMs && (x.source === 'replay' || x.source === 'device')
  const hr = valid(samples.heartRate, 300) ? samples.heartRate.value : null
  const oxygen = valid(samples.spo2, 100) ? samples.spo2.value : null
  const missing = hr === null || oxygen === null
  const severe = (hr !== null && (hr <= policy.hrSevereLow || hr >= policy.hrSevereHigh)) || (oxygen !== null && oxygen < policy.spo2Severe)
  const mild = (hr !== null && (hr < policy.hrMin || hr > policy.hrMax)) || (oxygen !== null && oxygen < policy.spo2Min)
  const level = severe ? 'severe' : mild ? 'mild' : hr === null && oxygen === null ? 'unknown' : missing ? 'partial' : 'normal'
  return { level, missing, canRecover: level === 'normal', reason: level === 'severe' ? '指标超出演示暂停阈值' : level === 'mild' ? '指标超出演示参考范围' : level === 'partial' ? '部分数据缺失' : level === 'normal' ? '已获取指标在配置范围内' : '健康数据未连接' }
}
