import fetch from '@system.fetch'
// Short requests avoid the device fetch timeout. The API key stays on Ubuntu.
export default {
  timeoutMs: 55000,
  status(done) {
    fetch.fetch({url:'http://10.0.2.2:8765/status', responseType:'json',
      success(r) { try { const b=typeof r.data==='string'?JSON.parse(r.data):r.data;done(r.code===200 && b.configured ? 'AI 转发服务在线；计划来源以本次生成结果为准' : 'AI 密钥尚未配置') } catch(e){done('AI 状态响应无效')} },
      fail(){done('无法连接 Ubuntu AI 服务，请检查服务是否启动')} })
  },
  ask(options) {
    let active = true; let timer
    const end = () => { active = false; clearTimeout(timer) }
    const fail = reason => { if (active) { end(); options.fail({reason: typeof reason === 'string' ? reason : '网络连接失败'}) } }
    const reason = body => {
      if (body.error === 'upstream_http') return ({401:'MiMo 密钥无效',402:'MiMo 额度不足',403:'MiMo 权限不足',429:'MiMo 请求受限'})[body.upstream_status] || 'MiMo 服务返回错误'
      return ({busy:'AI 正忙，请稍后重试',rate_limit:'请求过于频繁',not_configured:'MiMo 密钥未配置',upstream_timeout:'MiMo 响应超时',upstream_unavailable:'MiMo 网络或响应异常',upstream_empty:'MiMo 未返回有效内容',job_not_found:'AI 任务已过期'})[body.error] || 'AI 请求失败'
    }
    const request = (path, data) => {
      if (!active) return
      fetch.fetch({
        url: 'http://10.0.2.2:8765' + path,
        method: data ? 'POST' : 'GET', responseType: 'json',
        header: { 'Content-Type': 'application/json' }, data: data || '',
        success(response) {
          if (!active) return
          try {
            const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
            if (response.code === 202) {
              const next = body.job ? '/plan/' + body.job : path
              timer = setTimeout(() => request(next), 1000)
            } else if (response.code === 200 && typeof body.reply === 'string') {
              end(); options.success({ reply: body.reply })
            } else fail(reason(body || {}))
          } catch (e) { fail('AI 返回格式错误') }
        }, fail: () => fail('无法连接 Ubuntu AI 服务')
      })
    }
    request('/plan', JSON.stringify({ query: options.query, kind: options.kind || 'plan' }))
    return end
  }
}
