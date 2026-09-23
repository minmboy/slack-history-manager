import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/context'
import { CONVERSATION_TYPES } from '../lib/api'
import { remainingOf, type HistoryMap } from '../lib/history'
import type { Conversation, ConversationKind } from '../lib/types'

/** How the list is ordered. Everything but `name` reads this browser's history. */
export type PickerSort = 'name' | 'remaining' | 'recent'
/** Which rows are shown: all, those with your messages left, or those never scanned. */
export type PickerShow = 'all' | 'remaining' | 'unscanned'

interface Props {
  conversations: Conversation[]
  loading: boolean
  namesPending: number
  kinds: ConversationKind[]
  selected: Set<string>
  scanFrom: string
  onKindsChange: (kinds: ConversationKind[]) => void
  onSelectedChange: (selected: Set<string>) => void
  onScanFromChange: (value: string) => void
  onScan: () => void
  /** What this browser remembers about each conversation: scans and deletions. */
  history: HistoryMap
  onClearHistory: () => void
  sort: PickerSort
  onSortChange: (sort: PickerSort) => void
  show: PickerShow
  onShowChange: (show: PickerShow) => void
}

export function ConversationPicker({
  conversations,
  loading,
  namesPending,
  kinds,
  selected,
  scanFrom,
  onKindsChange,
  onSelectedChange,
  onScanFromChange,
  onScan,
  history,
  onClearHistory,
  sort,
  onSortChange,
  show,
  onShowChange,
}: Props) {
  const { t, n, formatRelative, formatTime } = useI18n()
  const [query, setQuery] = useState('')

  const hasHistory = Object.keys(history).length > 0
  // With no history there is nothing to sort or filter by, so fall back quietly.
  const activeSort = hasHistory ? sort : 'name'
  const activeShow = hasHistory ? show : 'all'

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = conversations.filter((item) => {
      if (needle && !item.label.toLowerCase().includes(needle) && !item.id.toLowerCase().includes(needle)) return false
      if (activeShow === 'remaining') return (remainingOf(history[item.id]) ?? 0) > 0
      if (activeShow === 'unscanned') return history[item.id]?.scannedAt === undefined
      return true
    })
    const byName = (a: Conversation, b: Conversation) => {
      // Unresolved names sink to the bottom so the useful rows are reachable first.
      if (a.labelResolved !== b.labelResolved) return a.labelResolved ? -1 : 1
      return a.label.localeCompare(b.label, t.locale)
    }
    // Never-scanned rows go last under the history sorts: -1 is below any count or date.
    const key = (item: Conversation) =>
      activeSort === 'remaining'
        ? (remainingOf(history[item.id]) ?? -1)
        : activeSort === 'recent'
          ? Math.max(history[item.id]?.scannedAt ?? -1, history[item.id]?.deletedAt ?? -1)
          : 0
    return rows.sort((a, b) => key(b) - key(a) || byName(a, b))
  }, [conversations, query, t.locale, history, activeSort, activeShow])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  function toggleKind(kind: ConversationKind) {
    const next = kinds.includes(kind) ? kinds.filter((item) => item !== kind) : [...kinds, kind]
    if (next.length > 0) onKindsChange(next)
  }

  const allVisibleOn = visible.length > 0 && visible.every((item) => selected.has(item.id))

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>{t.picker.title}</h2>
          <div className="spacer" />
          <span className="hint">
            {loading ? t.picker.loading : t.picker.count(n(conversations.length))}
            {namesPending > 0 && t.picker.namesPending(n(namesPending))}
          </span>
        </header>

        <div className="panel-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <span className="hint" style={{ minWidth: 62 }}>
              {t.picker.kindsLabel}
            </span>
            <div className="chip-group">
              {CONVERSATION_TYPES.map((type) => (
                <button
                  key={type.kind}
                  type="button"
                  className="chip"
                  data-on={kinds.includes(type.kind)}
                  onClick={() => toggleKind(type.kind)}
                  title={t.picker.scopeTip(type.scopes.join(', '))}
                >
                  {t.kind.long[type.kind]}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <span className="hint" style={{ minWidth: 62 }}>
              {t.picker.rangeLabel}
            </span>
            <input
              className="input"
              type="date"
              style={{ width: 170 }}
              value={scanFrom}
              onChange={(event) => onScanFromChange(event.target.value)}
            />
            <span className="hint">{t.picker.rangeHint}</span>
          </div>

          {hasHistory && (
            <div className="row" style={{ marginTop: 14 }}>
              <span className="hint" style={{ minWidth: 62 }}>
                {t.picker.showLabel}
              </span>
              <div className="chip-group">
                {(['all', 'remaining', 'unscanned'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="chip"
                    data-on={activeShow === option}
                    onClick={() => onShowChange(option)}
                  >
                    {t.picker.show[option]}
                  </button>
                ))}
              </div>
              <div className="spacer" style={{ flex: 1 }} />
              <label className="hint" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
                {t.picker.sortLabel}
                <select
                  className="select"
                  value={activeSort}
                  onChange={(event) => onSortChange(event.target.value as PickerSort)}
                >
                  {(['name', 'remaining', 'recent'] as const).map((option) => (
                    <option key={option} value={option}>
                      {t.picker.sort[option]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {kinds.some((kind) => kind !== 'im') && (
            <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.picker.nonDmWarning(<code className="inline">missing_scope</code>)}
            </p>
          )}
        </div>

        <div className="toolbar">
          <input
            className="search"
            placeholder={t.picker.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="btn ghost sm"
            disabled={visible.length === 0}
            onClick={() => {
              const next = new Set(selected)
              for (const item of visible) {
                if (allVisibleOn) next.delete(item.id)
                else next.add(item.id)
              }
              onSelectedChange(next)
            }}
          >
            {allVisibleOn ? t.picker.deselectVisible : t.picker.selectVisible}
          </button>
          {hasHistory && (
            <button type="button" className="btn ghost sm" title={t.picker.clearHistoryTip} onClick={onClearHistory}>
              {t.picker.clearHistory}
            </button>
          )}
        </div>

        <div className="list">
          {visible.length === 0 && (
            <div className="empty">{loading ? t.picker.emptyLoading : t.picker.emptyNone}</div>
          )}
          {visible.map((item) => {
            const record = history[item.id]
            const remaining = remainingOf(record)
            return (
              <label
                className="list-row"
                key={item.id}
                data-on={selected.has(item.id)}
                data-cleaned={record?.deletedAt ? true : undefined}
              >
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <span className="name">
                  {item.labelResolved ? item.label : <span style={{ color: 'var(--text-faint)' }}>{item.label}</span>}
                  <span className="sub">{item.id}</span>
                </span>
                {record && (
                  <span className="history">
                    {record.scannedAt !== undefined && (
                      <span title={formatTime(record.scannedAt)}>
                        {t.picker.historyScanned(formatRelative(record.scannedAt), n(record.found ?? 0))}
                        {record.since ? t.picker.historySince(record.since) : ''}
                        {remaining !== undefined && remaining !== (record.found ?? 0) && t.picker.historyRemaining(n(remaining))}
                      </span>
                    )}
                    {record.deletedAt !== undefined && (
                      <span className="deleted" title={formatTime(record.deletedAt)}>
                        {t.picker.historyDeleted(formatRelative(record.deletedAt), n(record.deleted ?? 0))}
                      </span>
                    )}
                  </span>
                )}
                <span className="meta">{t.kind.short[item.kind]}</span>
              </label>
            )
          })}
        </div>
      </section>

      <div className="sticky-foot">
        <div className="summary">{t.picker.selectedSummary(<b>{n(selected.size)}</b>)}</div>
        <button className="btn primary" disabled={selected.size === 0} onClick={onScan}>
          {t.picker.scanButton}
        </button>
      </div>
    </>
  )
}
