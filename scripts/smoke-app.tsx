/**
 * 冒烟测试：在 Node 中以 SSR 方式渲染 App 与边界追溯面板，验证渲染链路不抛异常、
 * 关键文案（时间基准 / 观测面板 / 精确观测零步证明 / 推导步骤 / 反向标记 /
 * 不可追溯原因 / 分层排程各层结果）存在。
 * 运行：npm run smoke（见 package.json scripts）
 */
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import App from '../src/App'
import WindowsTable from '../src/components/WindowsTable'
import CyclePanel from '../src/components/CyclePanel'
import ObservationEditor from '../src/components/ObservationEditor'
import AuditPanel from '../src/components/AuditPanel'
import { analyze, traceBound } from '../src/lib/graph'
import { buildConsistentSample } from '../src/lib/samples'

let failed = 0
/** React SSR 会在插值文本之间插入 <!-- -->，先去除再做片段匹配 */
function check(rawHtml: string, fragment: string, label: string) {
  const html = rawHtml.replace(/<!-- -->/g, '')
  if (!html.includes(fragment)) {
    failed++
    console.error('SMOKE FAIL:', label, '缺少片段:', fragment)
  }
}

// 1) 整个 App 初始渲染
const appHtml = renderToString(h(App))
check(appHtml, '各事件的绝对时间窗', 'App')
check(appHtml, '差分约束图', 'App')
check(appHtml, '点击最早/最晚时间可追溯边界推导链', 'App')
check(appHtml, '时间基准', 'App')
check(appHtml, '时间原点', 'App')
check(appHtml, '绝对时间观测', 'App')
check(appHtml, '批量证词导入', 'App')
check(appHtml, 'EVENT / REL / OBS', 'App')
check(appHtml, '精确时刻（零宽区间）', 'App')
check(appHtml, '直接观测', 'App')

// 1b) 分层最小偏差排程（默认示例：恢复=高优先级 期望 +25 → 高层 D=5；复盘=低优先级 → 低层 D=0）
check(appHtml, '分层最小偏差排程', '分层最小偏差排程')
check(appHtml, '期望时刻', '分层最小偏差排程')
check(appHtml, '高优先级', '分层最小偏差排程')
check(appHtml, '中优先级', '分层最小偏差排程')
check(appHtml, '低优先级', '分层最小偏差排程')
check(appHtml, 'D = 5', '分层最小偏差排程')
check(appHtml, 'D = 0', '分层最小偏差排程')
check(appHtml, '无参与事件', '分层最小偏差排程')
check(appHtml, '最大偏差', '分层最小偏差排程')
check(appHtml, '达到 ±D', '分层最小偏差排程')
check(appHtml, '层级', '分层最小偏差排程')
check(appHtml, '已定时', '分层最小偏差排程')
check(appHtml, '未定时', '分层最小偏差排程')

// 1b2) 冗余证词审计（默认示例 7 条启用证词全部必要；推导区间、结论与筛选渲染）
check(appHtml, '冗余证词审计', '冗余审计')
check(appHtml, '推导区间（排除该证词后）', '冗余审计')
check(appHtml, '证词区间', '冗余审计')
check(appHtml, '冗余 0 · 必要 7', '冗余审计：计数')
check(appHtml, '全部 7', '冗余审计：全部筛选')
check(appHtml, '冗余 0', '冗余审计：冗余筛选')
check(appHtml, '必要 7', '冗余审计：必要筛选')
check(appHtml, '>必要<', '冗余审计：必要结论徽章')
check(appHtml, '不修改任何约束，也不写入本地存档', '冗余审计：只读说明')
// 示例中「复盘 晚于 恢复」是唯一连接，排除后双侧无界
check(appHtml, '[−∞, +∞] 分钟', '冗余审计：无界区间展示')
// 「恢复 晚于 告警 8~20」排除后推导 [10, 25]
check(appHtml, '[10, 25] 分钟', '冗余审计：推导区间数值')

// 矛盾状态：审计面板显示暂停提示
const sAudit = buildConsistentSample()
const auditNullHtml = renderToString(
  h(AuditPanel, { events: sAudit.events, constraints: sAudit.constraints, audit: null }),
)
check(auditNullHtml, '冗余证词审计', '冗余审计暂停：标题仍在')
check(auditNullHtml, '冗余证词审计已暂停', '冗余审计暂停：矛盾提示')
check(auditNullHtml, '恢复可满足后审计自动重算', '冗余审计暂停：自动重算说明')

// 空状态：没有已启用约束时提示停用的约束不参与
const auditEmptyHtml = renderToString(h(AuditPanel, { events: [], constraints: [], audit: [] }))
check(auditEmptyHtml, '没有已启用的相对约束可审计（停用的约束不参与审计）', '冗余审计：空态提示')

// 1c) 观测编辑器可独立渲染
const s0 = buildConsistentSample()
const obsHtml = renderToString(
  h(ObservationEditor, {
    events: s0.events,
    observations: s0.observations,
    cycleObservationIds: new Set<string>(),
    onAdd: () => {},
    onRemove: () => {},
    onUpdate: () => {},
  }),
)
check(obsHtml, '添加观测', '观测编辑器')
check(obsHtml, '发生于', '观测编辑器')

// 2) 主时间窗表 + 三种追溯形态
const s = buildConsistentSample()
const r = analyze(s.events, s.constraints, s.observations)
const byName = new Map(s.events.map((e, i) => [e.name, i]))
const anchorIdx = byName.get('值班告警触发')!
const recovered = byName.get('服务恢复')!

const renderTable = (eventIdx: number, kind: 'earliest' | 'latest') =>
  renderToString(
    h(WindowsTable, {
      events: s.events,
      windows: r.windows,
      cycleEventIds: new Set<string>(),
      baseISO: r.baseISO,
      observations: s.observations,
      trace: traceBound(s.events, s.constraints, s.observations, eventIdx, kind),
      constraints: s.constraints,
      onTrace: () => {},
      onCloseTrace: () => {},
    }),
  )

// 精确观测事件：零步证明（由精确观测直接给出，而非锚点定义）
const anchorHtml = renderTable(anchorIdx, 'latest')
check(anchorHtml, '零步证明', '精确观测追溯')
check(anchorHtml, '精确时刻观测（零宽区间）', '精确观测追溯')

// 最晚边界：观测边 + 单步上界链
const latestHtml = renderTable(recovered, 'latest')
check(latestHtml, '边界依据追溯', '最晚追溯')
check(latestHtml, '第 2 步', '最晚追溯')
check(latestHtml, '采用上界侧不等式', '最晚追溯')
check(latestHtml, '累计偏移', '最晚追溯')
check(latestHtml, '≤ +20', '最晚追溯')

// 最早边界：观测边 + 反向图 3 步链，步骤带「反向」标记
const earliestHtml = renderTable(recovered, 'earliest')
check(earliestHtml, '反向差分图', '最早追溯')
check(earliestHtml, '第 4 步', '最早追溯')
check(earliestHtml, '反向', '最早追溯')
check(earliestHtml, '采用下界侧不等式', '最早追溯')
check(earliestHtml, '≥ +10', '最早追溯')
check(earliestHtml, '观测', '最早追溯（含观测步）')

// 无法定时事件：单元格不可点击且说明原因
check(earliestHtml, '无法定时，最早边界不存在、不可追溯', '不可追溯原因')
check(earliestHtml, '无法定时，最晚边界不存在、不可追溯', '不可追溯原因')

// 3) 矛盾面板：观测-约束混合矛盾链同时列出观测与约束
// B 比 A 晚 10~20（相对约束），但观测 A=08:00、B=08:05（精确）——唯一的环必含观测边
const mkEvents = [
  { id: 'a', name: 'A：车辆驶入路口' },
  { id: 'b', name: 'B：听到刹车声' },
]
const mkConstraints = [
  { id: 'cc1', aId: 'b', bId: 'a', relation: 'later' as const, min: 10, max: 20, enabled: true },
]
const mkObservations = [
  { id: 'oa', eventId: 'a', start: '2026-01-01T08:00', end: '2026-01-01T08:00' },
  { id: 'ob', eventId: 'b', start: '2026-01-01T08:05', end: '2026-01-01T08:05' },
]
const cr = analyze(mkEvents, mkConstraints, mkObservations)
if (cr.cycle) {
  const cycleHtml = renderToString(
    h(CyclePanel, {
      cycle: cr.cycle,
      events: mkEvents,
      constraints: mkConstraints,
      observations: mkObservations,
    }),
  )
  check(cycleHtml, '矛盾涉及绝对时间观测', '混合矛盾环')
  check(cycleHtml, '涉及的绝对时间观测', '混合矛盾环：观测清单')
  check(cycleHtml, '涉及的原始证词 / 相对约束', '混合矛盾环：约束清单')
} else {
  failed++
  console.error('SMOKE FAIL: 构造的观测-约束混合矛盾未被检出')
}

if (failed > 0) process.exit(1)
console.log('smoke ok')
