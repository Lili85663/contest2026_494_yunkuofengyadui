import fs from 'node:fs'
import assert from 'node:assert/strict'
const urls = {}
async function load(name) {
  let code = fs.readFileSync(new URL('../src/common/' + name + '.js', import.meta.url), 'utf8')
  code = code.replace(/from '\.\/([^']+)'/g, (_, dep) => 'from ' + JSON.stringify(urls[dep]))
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  urls[name] = url; return import(url)
}
const d = await load('focusPlan')
const planner = await load('studyPlanner')
const health = await load('healthPolicy')
const advisor = await load('healthAdvisor')
const { createStore, KEY } = await load('storage-core')
const now = new Date(2026, 8, 18, 12).getTime()
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name) }
function state(minutes = 5, modules = [{ title: '学习', task: '练习', minutes }]) {
  const s = d.fresh(); assert(d.makePlan(s, '学习目标', minutes, modules, 'test', now)); return s
}
function running() { const s = state(); d.startModule(s, now); return s }
await test('input and module sum validation', () => {
  assert(!d.checkInput('', 5)); assert(!d.checkInput('a', 4)); assert(!d.checkInput('a', Infinity)); assert(!d.checkInput('a', 5.5))
  assert(d.checkInput('a', 180)); assert(!d.validModules([{ title: '', task: 'a', minutes: 5 }], 5))
  assert(!d.validModules([{ title: 'a', task: 'a', minutes: 6 }], 5))
})
await test('plan requires acceptance and active plan cannot be replaced', () => {
  const s = state(); assert.equal(s.currentModule, null); d.tick(s, now + 999999); assert.equal(s.plan.status, 'planned')
  d.startModule(s, now); assert(!d.startModule(s, now)); assert(!d.makePlan(s, 'other', 5, s.plan.modules, 'test', now))
})
await test('expiration requires confirmation, repeated confirmation is idempotent', () => {
  const s = running(); d.tick(s, now + 999999); assert.equal(s.currentModule.accumulatedMs, 300000); assert.equal(s.currentModule.status, 'awaiting_result'); assert.equal(d.totals(s, now).count, 0)
  assert(!s.currentModule.activityPrompt); assert(d.confirmResult(s, true, now)); assert(!d.confirmResult(s, true, now)); assert.equal(d.totals(s, now).count, 1)
})
await test('early incomplete keeps actual learning duration without completed count', () => {
  const s = running(); d.finishEarly(s, now + 90000); d.confirmResult(s, false, now)
  assert.equal(s.records[0].actualMs, 90000); assert.equal(d.totals(s, now).count, 0); assert.equal(d.totals(s, now).minutes, 1)
})
await test('early complete counts actual duration, not planned duration', () => {
  const s = running(); d.finishEarly(s, now + 15000); d.confirmResult(s, true, now)
  assert.equal(s.records[0].actualMs, 15000); assert.equal(d.totals(s, now).count, 1)
})
await test('pause excludes idle time and checkpoints preserve duration', () => {
  const s = running(); d.pause(s, now + 30000); d.tick(s, now + 900000); assert.equal(d.remaining(s, now), 270000)
  d.resume(s, now + 900000); d.checkpoint(s, now + 910000); d.finishEarly(s, now + 920000); assert.equal(s.currentModule.accumulatedMs, 50000)
})
await test('two minute reminder repeats on accumulated study milestones', () => {
  const s = running(); d.tick(s, now + 120000); assert(s.currentModule.activityPrompt)
  d.activity(s, now + 120000, false); d.pause(s, now + 130000); d.resume(s, now + 150000); d.tick(s, now + 160000)
  assert.equal(s.currentModule.nextActivityAtMs, 240000); assert(!s.currentModule.activityPrompt)
  d.tick(s, now + 260000); assert(s.currentModule.activityPrompt); assert.equal(s.currentModule.nextActivityAtMs, 360000)
})
await test('rest automatically resumes, rest time excluded', () => {
  const s = running(); d.activity(s, now + 120000, true); assert.equal(s.currentModule.status, 'resting')
  d.tick(s, now + 180000); assert.equal(s.currentModule.status, 'running'); assert.equal(s.currentModule.remainingMs, 180000)
  d.tick(s, now + 360000); assert.equal(s.currentModule.accumulatedMs, 300000)
})
await test('paused rest does not automatically resume until user resumes rest', () => {
  const s = running(); d.activity(s, now + 120000, true); d.pause(s, now + 140000); d.tick(s, now + 999999)
  assert.equal(s.currentModule.status, 'paused'); assert.equal(s.currentModule.restRemainingMs, 40000)
  d.resume(s, now + 1000000); d.tick(s, now + 1040000); assert.equal(s.currentModule.status, 'running')
})
await test('severe during rest prevents automatic resume', () => {
  const s = running(); d.activity(s, now + 120000, true); d.blockHealth(s, now + 150000); d.tick(s, now + 999999)
  assert(s.healthBlocked); assert.equal(s.currentModule.status, 'paused'); assert(!d.resume(s, now + 999999))
  assert(!d.unlockHealth(s, { canRecover: false })); assert(d.unlockHealth(s, { canRecover: true })); assert.equal(s.currentModule.status, 'paused')
})
await test('severe at exact rest deadline cannot bypass lock', () => {
  const s = running(); d.activity(s, now + 120000, true); d.blockHealth(s, now + 180000)
  assert.equal(s.currentModule.status, 'paused'); assert(s.healthBlocked)
})
await test('severe while manually paused retains pause and locks', () => {
  const s = running(); d.pause(s, now + 1000); d.blockHealth(s, now + 2000); assert(s.healthBlocked); assert(!d.resume(s, now + 3000))
})
await test('each module has own prompt and next module requires user action', () => {
  const s = state(6, [{ title: 'a', task: 'a', minutes: 3 }, { title: 'b', task: 'b', minutes: 3 }]); d.startModule(s, now)
  d.tick(s, now + 120000); d.tick(s, now + 180000); d.confirmResult(s, false, now + 180000); assert.equal(s.plan.status, 'between_modules')
  d.tick(s, now + 999999); assert.equal(s.currentModule.status, 'recorded'); d.startModule(s, now + 1000000)
  assert.equal(s.currentModule.nextActivityAtMs, 120000); d.tick(s, now + 1120000); assert(s.currentModule.activityPrompt)
})
await test('restart pauses at last checkpoint and retains health lock', () => {
  const s = running(); d.checkpoint(s, now + 5000); const r = d.restoreState(JSON.parse(JSON.stringify(s)))
  assert.equal(r.currentModule.status, 'paused'); assert.equal(r.currentModule.remainingMs, 295000)
  d.blockHealth(r, now + 900000); assert(d.restoreState(r).healthBlocked)
})
await test('corrupt timer cannot silently reset storage', () => {
  const s = running(); s.currentModule.remainingMs = -1; assert.throws(() => d.validateState(s))
})
const sample = (value, at = now) => ({ value, at, source: 'replay' })
await test('null, empty, invalid, future, stale health are not zero or normal', () => {
  for (const v of [null, '', '80', NaN, Infinity, -1, 0]) assert.equal(health.classifyHealth({ heartRate: sample(v) }, now).level, 'unknown')
  assert.equal(health.classifyHealth({ heartRate: sample(80, now - 30001) }, now).level, 'unknown')
  assert.equal(health.classifyHealth({ heartRate: sample(80, now + 1) }, now).level, 'unknown')
  assert.equal(health.classifyHealth({ spo2: sample(101) }, now).level, 'unknown')
})
await test('partial cannot unlock; severe one valid sample suffices', () => {
  assert.equal(health.classifyHealth({ heartRate: sample(80) }, now).level, 'partial')
  assert(!health.classifyHealth({ heartRate: sample(80) }, now).canRecover)
  assert.equal(health.classifyHealth({ heartRate: sample(140) }, now).level, 'severe')
  assert.equal(health.classifyHealth({ heartRate: sample(80), spo2: sample(89) }, now).level, 'severe')
  assert.equal(health.classifyHealth({ heartRate: sample(120), spo2: sample(98) }, now).level, 'mild')
  assert(health.classifyHealth({ heartRate: sample(80), spo2: sample(98) }, now).canRecover)
})
await test('local planner and unavailable provider keep explicit source', () => {
  let result; planner.requestStudyPlan(null, '目标', 5, r => result = r)
  assert(result.source.startsWith('本地计划')); assert(d.validModules(result.modules, 5))
})
await test('valid AI plan accepted, invalid sum and malformed JSON fall back', () => {
  for (const reply of ['not json', '[{"title":"a","task":"b","minutes":6}]', '[{"title":"a","task":"b","minutes":5}]']) {
    let result; planner.requestStudyPlan({ ask: o => o.success({ reply }) }, '目标', 5, r => result = r)
    assert(d.validModules(result.modules, 5)); assert.equal(result.source === 'MiMo 学习计划', reply.includes('minutes":5'))
  }
})
await test('cancelled and late AI responses never replace current plan', async () => {
  let callback, calls = 0
  const cancel = planner.requestStudyPlan({ ask: o => callback = o }, '目标', 5, () => calls++, 5)
  cancel(); callback.success({ reply: '[]' }); await new Promise(r => setTimeout(r, 10)); assert.equal(calls, 0)
  planner.requestStudyPlan({ ask: o => callback = o }, '目标', 5, () => calls++, 5)
  await new Promise(r => setTimeout(r, 10)); callback.success({ reply: '[]' }); assert.equal(calls, 1)
})
await test('severe pause does not depend on AI or storage', () => {
  const s = running(); const store = createStore({ set: o => o.fail('', 500) })
  d.blockHealth(s, now + 1000); assert.equal(s.currentModule.status, 'paused')
  return assert.rejects(store.save(s)).then(() => assert(s.healthBlocked))
})
await test('storage serializes snapshots, retains writes and recovers after failure', async () => {
  const calls = []; const store = createStore({ set: o => calls.push(o) }); const s = running()
  const a = store.save(s); d.pause(s, now + 1000); const b = store.save(s)
  await Promise.resolve(); assert.equal(calls.length, 1); assert.equal(JSON.parse(calls[0].value).currentModule.status, 'running')
  calls[0].success(); await a; await new Promise(r => setTimeout(r, 0)); assert.equal(calls.length, 2)
  assert.equal(JSON.parse(calls[1].value).currentModule.status, 'paused'); calls[1].success(); await b
  assert.equal(KEY, 'wrist-rhythm-v3')
})

await test('hide at deadline reports transition for persistence', () => {
  const s = running(); assert(d.pause(s, now + 300000)); assert.equal(s.currentModule.status, 'awaiting_result')
})
await test('actual page handlers: direct start, pause, rest, confirm and statistics', async () => {
  const ux = fs.readFileSync(new URL('../src/pages/index/index.ux', import.meta.url), 'utf8')
  const script = ux.split('<script>')[1].split('</script>')[0].replace(/^import .*$/gm, '').replace('export default', 'return')
  let time = now; const snapshots = []
  const page = new Function('flow','store','requestStudyPlan','provider','healthProvider','classifyHealth','healthAdvice','Date', script)(
    d, { load: () => Promise.resolve(d.fresh()), save: s => { snapshots.push(JSON.stringify(s)); return Promise.resolve() } },
    planner.requestStudyPlan, null, null, health.classifyHealth, () => '本地建议', { now: () => time })
  const ui = Object.assign({}, page, JSON.parse(JSON.stringify(page.private)))
  ui.onInit(); await new Promise(r => setTimeout(r, 0)); ui._visible = true
  ui.editGoal(); ui.appendKey('学习'); ui.appendKey('数学'); ui.closeEditor(); assert.equal(ui.goal, '学习数学')
  ui.editMinutes(); ui.clearEntry(); ui.appendKey('5'); ui.closeEditor(); ui.directStart()
  assert.equal(ui._state.plan.modules.length, 1); assert.equal(ui._state.currentModule.status, 'running')
  time += 120000; ui.tick(); assert(ui.activityVisible); ui.takeActivity(); assert.equal(ui._state.currentModule.status, 'resting')
  time += 60000; ui.tick(); assert.equal(ui._state.currentModule.status, 'running')
  time += 1000; ui.togglePause(); assert.equal(ui._state.currentModule.status, 'paused')
  ui.togglePause(); time += 1000; ui.finishModule(); assert(ui.awaitingResult); ui.confirmComplete(); ui.confirmComplete()
  assert.equal(ui.count, 1); assert.equal(ui._state.records.length, 1); assert.equal(ui._state.records[0].actualMs, 122000)
  ui.generatePlan(); assert(ui.planned); assert(ui.planSource.startsWith('本地计划')); assert.equal(ui._state.currentModule, null)
  ui.onDestroy(); await new Promise(r => setTimeout(r, 0)); assert(snapshots.length > 0)
})
await test('recurring prompts exclude rest, pause, and survive restart', () => {
  const s = running(); d.tick(s, now + 120000); d.activity(s, now + 120000, true)
  d.tick(s, now + 180000); d.tick(s, now + 299999); assert(!s.currentModule.activityPrompt)
  d.tick(s, now + 300000); assert(s.currentModule.activityPrompt)
  d.activity(s, now + 300000, false); d.pause(s, now + 301000)
  const r = d.restoreState(JSON.parse(JSON.stringify(s))); assert.equal(r.currentModule.nextActivityAtMs, 360000)
  assert(!r.currentModule.activityPrompt)
})
await test('legacy one-shot records migrate, missed checkpoints do not stack prompts', () => {
  const s = running(); d.checkpoint(s, now + 150000); delete s.currentModule.nextActivityAtMs; s.currentModule.activityPromptShown = true
  d.restoreState(s); assert.equal(s.currentModule.nextActivityAtMs, 240000)
  const r = state(10); d.startModule(r, now); d.tick(r, now + 370000)
  assert(r.currentModule.activityPrompt); assert.equal(r.currentModule.nextActivityAtMs, 480000)
  d.activity(r, now + 370000, false); d.tick(r, now + 370001); assert(!r.currentModule.activityPrompt)
})
await test('gateway provider polls a job, parses JSON and stops after success', () => {
  const code = fs.readFileSync(new URL('../src/common/ai-provider.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('export default', 'return')
  const requests = []; let timer; let result; let failures = 0
  const adapter = new Function('fetch','setTimeout','clearTimeout',code)({fetch:o=>requests.push(o)}, fn=>{timer=fn;return 1},()=>{timer=null})
  adapter.ask({query:'math',success:r=>{result=r},fail:()=>failures++})
  assert.equal(requests[0].method,'POST'); requests[0].success({code:202,data:{job:'abc'}})
  timer(); assert.equal(requests[1].url,'http://10.0.2.2:8765/plan/abc')
  requests[1].success({code:202,data:{pending:true}}); timer()
  requests[2].success({code:200,data:JSON.stringify({reply:'[]'})})
  assert.deepEqual(result,{reply:'[]'}); assert.equal(timer,null); assert.equal(failures,0)
})
await test('gateway cancellation ignores pending callbacks without more polling', () => {
  const code = fs.readFileSync(new URL('../src/common/ai-provider.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('export default', 'return')
  let request; let calls=0
  const adapter = new Function('fetch','setTimeout','clearTimeout',code)({fetch:o=>{request=o}},()=>{calls++},()=>{})
  const cancel=adapter.ask({query:'math',success:()=>calls++,fail:()=>calls++});cancel()
  request.success({code:202,data:{job:'abc'}});request.fail();assert.equal(calls,0)
})
await test('health snapshot excludes stale, invalid and identifying fields', () => {
  const samples={heartRate:{value:150,at:now,source:'replay',name:'private'},spo2:{value:92,at:now-31000,source:'replay'},stress:{value:20,at:now,source:'replay'},name:'private'}
  assert.deepEqual(advisor.healthSnapshot(samples,now),{source:'replay',heartRate:150,stress:20})
})
await test('health advice is brief, typed and never sends learning goal or identity', () => {
  let result; let query
  advisor.requestHealthAdvice({ask:o=>{query=o; o.success({reply:'回放指标有波动，建议暂停休息并复测。'})}}, {heartRate:{value:150,at:now,source:'replay'}},'severe',now,r=>{result=r})
  assert.equal(query.kind,'health');assert(query.query.includes('replay'));assert(result.source.startsWith('MiMo'))
  advisor.requestHealthAdvice({ask:o=>o.success({reply:'确诊某种疾病'})},{heartRate:{value:150,at:now,source:'replay'}},'severe',now,r=>{result=r})
  assert(result.source.startsWith('本地提醒'))
})
await test('health timeout and cancellation ignore late model output', async () => {
  let callback; let result; let calls=0
  advisor.requestHealthAdvice({ask:o=>{callback=o}},{heartRate:{value:150,at:now,source:'replay'}},'severe',now,r=>{result=r;calls++},2)
  await new Promise(r=>setTimeout(r,8));assert(result.source.includes('超时'))
  callback.success({reply:'休息并复测。'});assert.equal(calls,1)
  const cancel=advisor.requestHealthAdvice({ask:o=>{callback=o}},{heartRate:{value:150,at:now,source:'replay'}},'severe',now,()=>calls++)
  cancel();callback.success({reply:'休息并复测。'});assert.equal(calls,1)
})
await test('page cancels obsolete health advice, throttles samples, persists opt-out', async () => {
  const ux=fs.readFileSync(new URL('../src/pages/index/index.ux',import.meta.url),'utf8')
  const script=ux.split('<script>')[1].split('</script>')[0].replace(/^import .*$/gm,'').replace('export default','return')
  let time=now;let requests=0;let callbacks=[];let cancelled=0
  const page=new Function('flow','store','requestStudyPlan','provider','healthProvider','classifyHealth','healthAdvice','requestHealthAdvice','Date',script)(
    d,{load:()=>Promise.resolve(d.fresh()),save:()=>Promise.resolve()},planner.requestStudyPlan,null,null,health.classifyHealth,()=>'',
    (p,s,l,n,done)=>{requests++;callbacks.push(done);return()=>cancelled++},{now:()=>time})
  const ui=Object.assign({},page,JSON.parse(JSON.stringify(page.private)));ui.onInit();await new Promise(r=>setTimeout(r,0));ui._visible=true
  ui._samples={heartRate:{value:150,at:time,source:'replay'},spo2:{value:97,at:time,source:'replay'}}
  ui.checkHealth();assert(ui._state.healthBlocked);assert.equal(requests,1)
  ui.checkHealth();assert.equal(requests,1)
  ui._samples.heartRate.value=80;ui.checkHealth();callbacks[0]({text:'stale',source:'MiMo'});assert.equal(ui.healthAIText,'');assert(cancelled>0)
  time+=1000;ui._samples.heartRate={value:150,at:time,source:'replay'};ui.checkHealth();assert.equal(requests,1)
  time+=60000;ui._samples.heartRate.at=time;ui._samples.spo2.at=time;ui.checkHealth();assert.equal(requests,2)
  ui.toggleHealthAI();assert.equal(ui._state.aiHealthEnabled,false);callbacks[1]({text:'late',source:'MiMo'});assert.equal(ui.healthAIText,'')
  assert.equal(d.restoreState(JSON.parse(JSON.stringify(ui._state))).aiHealthEnabled,false);ui.onDestroy()
})
console.log(`${passed} tests passed`)

