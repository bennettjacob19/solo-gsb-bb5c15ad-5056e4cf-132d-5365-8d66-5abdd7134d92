import { useMemo, useState } from 'react'
import type { Constraint, RedundancyAuditEntry, TEvent } from '../types'
import { describeConstraint, formatDerivedRange } from '../lib/format'

interface Props {
  events: TEvent[]
  /** 有效约束（审计基于同一批约束；用于证词描述与录入序号） */
  constraints: Constraint[]
  /** 审计结果（按约束录入顺序）；系统矛盾时为 null（暂停审计） */
  audit: RedundancyAuditEntry[] | null
}

type Filter = 'all' | 'redundant' | 'necessary'

const FILTER_LABEL: Record<Filter, string> = {
  all: '全部',
  redundant: '冗余',
  necessary: '必要',
}

interface AuditRow {
  entry: RedundancyAuditEntry
  c: Constraint
  /** 约束在列表中的录入序号（从 1 起） */
  order: number
}

/**
 * 冗余证词审计面板（嵌入「时序约束」列表底部）：系统可满足时，逐条暂时排除
 * 一条已启用相对约束，基于其余约束与全部观测重新推导该证词两端事件的最紧
 * 时间差区间；推导区间完整落在原证词区间内 ⇒ 冗余，否则 ⇒ 必要，不可达的
 * 边界按无界（±∞）处理。列表可按结论筛选；停用的约束不参与审计。
 * 审计为只读分析：不修改任何约束，也不写入本地存档。
 */
export default function AuditPanel({ events, constraints, audit }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const nameOf = useMemo(() => {
    const m = new Map(events.map((e) => [e.id, e.name]))
    return (id: string) => m.get(id) ?? '（已删除事件）'
  }, [events])

  // 审计条目按约束录入顺序对齐约束本体与录入序号
  const rows = useMemo<AuditRow[]>(() => {
    if (!audit) return []
    const orderOf = new Map(constraints.map((c, i) => [c.id, i + 1]))
    const byId = new Map(constraints.map((c) => [c.id, c]))
    const out: AuditRow[] = []
    for (const entry of audit) {
      const c = byId.get(entry.constraintId)
      if (!c) continue
      out.push({ entry, c, order: orderOf.get(entry.constraintId)! })
    }
    return out
  }, [audit, constraints])

  const redundantCount = rows.filter((r) => r.entry.redundant).length
  const necessaryCount = rows.length - redundantCount
  const countOf = (f: Filter) =>
    f === 'all' ? rows.length : f === 'redundant' ? redundantCount : necessaryCount
  const visible = rows.filter(
    (r) => filter === 'all' || (filter === 'redundant') === r.entry.redundant,
  )

  return (
    <div className="audit-block">
      <div className="audit-head">
        <h4>
          冗余证词审计
          {audit !== null && rows.length > 0 && (
            <span className="count">
              冗余 {redundantCount} · 必要 {necessaryCount}
            </span>
          )}
        </h4>
        {audit !== null && rows.length > 0 && (
          <div className="audit-filters" role="group" aria-label="按结论筛选">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button
                key={f}
                className={`small${filter === f ? ' primary' : ''}`}
                onClick={() => setFilter(f)}
              >
                {FILTER_LABEL[f]} {countOf(f)}
              </button>
            ))}
          </div>
        )}
      </div>

      {audit === null && (
        <div className="schedule-note danger">
          ⛔ 系统存在矛盾，冗余证词审计已暂停：负环下最短路无意义，不输出任何审计结论。
          请先核对观测/证词或按上方修复建议处理，恢复可满足后审计自动重算。
        </div>
      )}

      {audit !== null && rows.length === 0 && (
        <div className="empty-hint">没有已启用的相对约束可审计（停用的约束不参与审计）。</div>
      )}

      {audit !== null && rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="windows audit-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>证词</th>
                  <th className="num">证词区间</th>
                  <th className="num">推导区间（排除该证词后）</th>
                  <th>结论</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ entry, c, order }) => (
                  <tr key={entry.constraintId}>
                    <td className="num">#{order}</td>
                    <td>{describeConstraint(c, nameOf)}</td>
                    <td className="num">
                      [{entry.min}, {entry.max}] 分钟
                    </td>
                    <td className="num">{formatDerivedRange(entry.derivedLo, entry.derivedHi)}</td>
                    <td>
                      <span
                        className={`badge ${entry.redundant ? 'redundant' : 'necessary'}`}
                        title={
                          entry.redundant
                            ? '排除该证词后，其余约束与全部观测推出的区间仍完整落在证词区间内：该证词不提供新的约束作用'
                            : '排除该证词后推导区间变宽或不可达：该证词对结论有实际约束作用'
                        }
                      >
                        {entry.redundant ? '冗余' : '必要'}
                      </span>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
                      当前筛选结论下没有记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="audit-note">
            逐条暂时排除一条已启用约束，基于其余约束与全部绝对时间观测重新推导该证词两端事件的
            最紧时间差区间（推导区间 ⊆ 证词区间 ⇒ 冗余，否则 ⇒ 必要；不可达的边界按无界 ±∞ 处理）。
            审计为只读分析：不修改任何约束，也不写入本地存档。
          </div>
        </>
      )}
    </div>
  )
}
