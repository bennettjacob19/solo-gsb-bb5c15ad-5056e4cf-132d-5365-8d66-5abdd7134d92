import type { Constraint, RedundancyAuditEntry, TimeObservation, TEvent } from '../types'
import { buildSystem, findNegativeCycle, shortestFrom } from './graph'

/**
 * 冗余证词审计。
 *
 * 前提：统一差分系统（相对约束 + 绝对时间观测）可满足；矛盾时返回 null，
 * 由界面显示「暂停审计」提示（负环下最短路无意义，不输出任何审计结论）。
 *
 * 对每一条**已启用**且两端事件都存在的相对约束 c（证词断言
 * min ≤ t_x − t_y ≤ max；earlier 时 x=B/y=A，later 时 x=A/y=B）：
 *
 * 1. 暂时把 c 产生的两条差分边从图中移除（其余约束与全部观测的边保持不变，
 *    与修复搜索复用同一套边过滤口径）；
 * 2. 在剩余图上求 t_x − t_y 的最紧区间：
 *    - 上界 = y → x 的最短路（边 u→v 权 w 表示 t_v − t_u ≤ w）；
 *    - 下界 = −(x → y 的最短路)；
 *    - 某方向不可达时该侧按无界处理（null，即 −∞ / +∞）；
 * 3. 推导区间完整落在原证词区间 [min, max] 内（两侧都有界且
 *    lo ≥ min、hi ≤ max）时结论为「冗余」——其余信息已能推出同等或更紧的
 *    时间差，该证词不提供新的约束作用；否则为「必要」。
 *
 * 停用的约束既不参与审计、也不参与推导（buildSystem 跳过未启用约束）。
 * 观测边与约束边在同一张图上，观测对事件的钉扎自然计入推导。
 * 审计为只读分析：不修改任何约束，也不写入本地存档。
 */
export function auditRedundancy(
  events: TEvent[],
  constraints: Constraint[],
  observations: TimeObservation[],
): RedundancyAuditEntry[] | null {
  const sys = buildSystem(events, constraints, observations)
  const m = sys.n + 1
  // 整体可满足性：矛盾时暂停审计
  if (findNegativeCycle(m, sys.edges)) return null

  const entries: RedundancyAuditEntry[] = []
  for (const c of constraints) {
    if (!c.enabled) continue // 停用的约束不参与审计
    // 证词断言 min ≤ t_x − t_y ≤ max
    const xId = c.relation === 'earlier' ? c.bId : c.aId
    const yId = c.relation === 'earlier' ? c.aId : c.bId
    const x = sys.indexOf.get(xId)
    const y = sys.indexOf.get(yId)
    if (x === undefined || y === undefined) continue // 引用缺失事件的约束不在差分图中

    // 暂时排除该约束的两条差分边，其余约束与全部观测的边保持不变
    const edges = sys.edges.filter(
      (e) => !(e.kind === 'constraint' && e.constraintId === c.id),
    )
    // t_x − t_y 的最小上界：y → x 最短路；不可达按 +∞（无界）
    const hiRaw = shortestFrom(y, m, edges)[x]
    // t_x − t_y 的最大下界：−(x → y 最短路)；不可达按 −∞（无界）
    const loRaw = shortestFrom(x, m, edges)[y]
    const derivedHi = Number.isFinite(hiRaw) ? hiRaw : null
    const derivedLo = Number.isFinite(loRaw) ? -loRaw : null
    const redundant =
      derivedLo !== null && derivedHi !== null && derivedLo >= c.min && derivedHi <= c.max

    entries.push({
      constraintId: c.id,
      xIdx: x,
      yIdx: y,
      min: c.min,
      max: c.max,
      derivedLo,
      derivedHi,
      redundant,
    })
  }

  return entries
}
