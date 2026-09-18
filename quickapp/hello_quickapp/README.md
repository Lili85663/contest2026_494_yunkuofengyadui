# 腕上节律教练 · 3.2

## 一、作品简介

面向学习场景的 openvela 手表快应用：输入目标和时间，选择直接专注或让 MiMo 拆分学习模块；每累计学习两分钟询问是否活动，结合健康回放演示异常暂停和简短建议。完成模块由用户确认，统计保存在本机。

- 纯色全屏、启动滑动解锁、手表点按键盘。
- 5～180 分钟，AI 计划经校验并获用户同意后开始；失败明确降级为本地计划。
- 暂停/继续、活动 1 分钟结束自动恢复；健康锁定优先，不自动越过锁定。
- 手动确认完成或未完成，保存实际学习时间，防止重复计数。
- 官方 `service.health` 心率、血氧、压力回放；压力仅展示。异常先执行本地规则，AI 可选，超时保留本地提醒。

**边界：健康数值是官方模拟器回放，不是佩戴者测量；简短建议不是疾病诊断。当前 AI 使用本机 MiMo 转发，原生 @system.velaclaw 尚未验收。**

## 二、选题方向

快应用 / 手表应用创新。以手表图形交互、时间状态管理和 openvela 健康接口形成可运行的学习辅助流程；AI 用于计划拆分及可选简短建议，不替代计时和本地异常处理。

团队仓：`contest2026_494_yunkuofengyadui`；日志归属 GitHub 用户：`Lili85663`。本包对应仓库 `quickapp/hello_quickapp` 的作品工程，不包含完整操作系统。

## 三、目录结构

| 路径 | 用途 |
|---|---|
| src/ | 页面、业务状态、存储及接口源码 |
| scripts/ | 测试构建、安装运行、私有密钥配置及本机服务 |
| integrations/ | 可选接口适配；原生 Agent 版本待验收 |
| tests/ | 业务与网关测试、设备诊断页面 |
| dist/ | 当前 3.2.0 调试安装包 |
| evidence/ | 已有界面验收截图，不作为实体传感器证明 |
| docs/ | [运行教程](docs/运行教程.md)、[文件功能说明](docs/文件功能说明.md) |
| logs/Lili85663/ | 本任务可见对话的脱敏导出与导出清单 |
| .claude/skills/ | 项目排障与验收 Skill |
| LICENSE、EXAMPLES-LICENSE、NOTICE | 项目许可、示例许可和复用来源 |

## 四、运行方式

完整首次安装步骤见[运行教程](docs/运行教程.md)。已配置的 Ubuntu 电脑：

```bash
cd /home/ma/wrist-rhythm
bash scripts/build-app.sh
bash scripts/deploy-app.sh
```

以后只打开已安装应用：`python3 scripts/open-app.py`。修改 `src/pages/index/index.ux` 后保存，再构建和部署；编译的是整个 src 工程，单纯编译不会刷新设备。

新电脑需先装官方 AIoT IDE/健康模拟器、创建 `wrist-rhythm-contest`，执行 `npm ci`、`bash scripts/setup-host.sh`，再用 `python3 scripts/configure-mimo.py` 私下配置密钥。Node 22 / Python 3；依赖按锁文件安装。本包不携带密钥或 node_modules。

调用链：快应用 → 模拟器 10.0.2.2:8765 → Ubuntu 本机服务 → MiMo `mimo-v2.5-pro`。本机服务只监听 127.0.0.1；实体设备不能直接照搬这个地址。当前方案无须搜索插件密钥。接入原生 Agent 前必须另行验证系统提供 `velaclaw.ask`。

本次整理核验：32 项 JavaScript 业务测试、5 项 Python 网关测试通过；RPK ZIP 完整性、版本、文档链接及明文凭据扫描通过。此次主要整理文档和目录，未重新进行设备界面验收；已有截图保留原验收含义。

测试：`npm test`、`python3 tests/gateway_test.py`；构建脚本也会执行这两项。既有验收覆盖实际 MiMo 计划、短健康建议和官方健康回放；截图在 evidence。完整提交仍需正式作品介绍、演示视频、官方日志核验及账号/CLA/PR 流程，本包不代表已提交或获奖资格确认。

## 五、AI Coding 使用说明

开发中使用 Codex 协助拆分需求、设计计时状态机、编写快应用页面与接口封装、补业务测试、定位模拟器部署和 AI 超时问题、整理教程。用户决定两分钟提醒、休息自动恢复、模块手动确认等规则，并通过界面反馈推动修改。

实际帮助：将长 AI 请求改为任务提交与轮询，区分实时连接状态与旧计划来源，增加异常建议取消和节流，统一构建部署入口；这不等于所有生成代码都已获得设备或医疗验证。

`logs/Lili85663/` 是本次 Codex 会话的**用户可见消息脱敏导出**。它不是组委会采集器原始日志，不含隐藏推理、凭据、原始工具输出及图片附件。条数、范围、脱敏方式见 export-manifest.json。不能据此声称满足不可修改原始日志要求；正式提交按[官方日志指南](https://github.com/open-vela/docs/blob/dev-ai-contest-2026/zh-cn/contest_2026/ai_coding_log_guide.md)核验，敏感原始会话不要直接提交。

参照[大赛总览](https://github.com/open-vela/docs/blob/dev-ai-contest-2026/zh-cn/contest_2026/contest_overview.md)整理作品说明，未擅自改为 trunk 或宣称原生 Agent 接通。

原创代码采用 Apache-2.0；工程组织和图标参考 open-vela/packages_fe_examples 的 multi_screen_todolist。保留 EXAMPLES-LICENSE 和 NOTICE，第三方依赖遵循各自许可。
