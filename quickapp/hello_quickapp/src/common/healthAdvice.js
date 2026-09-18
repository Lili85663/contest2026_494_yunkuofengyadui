// Immediate local reminder; optional cloud advice is handled separately in healthAdvisor.
const TEXT = { normal: '已获取指标在配置范围内。', partial: '部分数据缺失，请以自身感受为准。', unknown: '健康数据未连接，不影响普通学习计时。', mild: '建议暂时休息，由你决定是否继续。', severe: '已自动暂停，请先休息；如有不适请寻求专业帮助。' }
export function healthAdvice(level) { return TEXT[level] || TEXT.unknown }
