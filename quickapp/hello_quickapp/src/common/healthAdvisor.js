// Minimal current samples only; never send identity, history, or stale values.
export function healthSnapshot(samples, now) {
  const result = { source: 'replay' }
  ;[['heartRate',300],['spo2',100],['stress',1000]].forEach(row => {
    const s = samples[row[0]]
    if (!s || !Number.isFinite(s.value) || s.value <= 0 || s.value > row[1] || !Number.isFinite(s.at) || s.at > now || now-s.at > 30000 || ['device','replay'].indexOf(s.source)<0) return
    result[row[0]] = s.value
    if(s.source==='device') result.source='device'
  })
  return result
}
export function requestHealthAdvice(provider, samples, level, now, done, timeoutMs=12000) {
  let finished=false, abort, timer
  const finish = (text,source) => { if(finished)return;finished=true;clearTimeout(timer);if(typeof abort==='function')abort();done({text,source}) }
  const local = reason => finish('先暂停并休息，检查佩戴后复测；如明显不适，请及时就医。','本地提醒：'+reason)
  const snapshot=healthSnapshot(samples,now)
  if(!['mild','severe'].includes(level) || (snapshot.heartRate===undefined && snapshot.spo2===undefined)) { local('缺少有效异常指标');return ()=>{} }
  timer=setTimeout(()=>local('AI 超时'),timeoutMs)
  try {
    if(!provider || typeof provider.ask!=='function') local('AI 未连接')
    else abort=provider.ask({kind:'health', query:'为腕上学习助手提供简短健康提醒，最多两句、60个汉字。仅说明可能的测量影响及休息复测建议；不能诊断疾病、开药或保证安全，不解读压力值为疾病。严重不适提示及时就医。source=replay 表示模拟器回放，必须说回放，不说用户患病。数据仅为当前采样，开发阈值标记='+level+'；'+JSON.stringify(snapshot),
      success(r) {
        const text=r && typeof r.reply==='string'?r.reply.trim():''
        if(!text || text.length>100 || /```|确诊|服用|用药剂量|无需就医|保证安全/.test(text)) {local('AI 内容不符合简短提醒格式');return}
        finish(text,'MiMo 简短建议 · 非医疗诊断')
      },fail(e){local(e && e.reason ? e.reason : 'AI 暂不可用')} })
    if(finished && typeof abort==='function')abort()
  } catch(e){local('接口不可用')}
  return ()=>{finished=true;clearTimeout(timer);if(typeof abort==='function')abort()}
}
