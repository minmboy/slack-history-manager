import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/context'
import { listMembers } from '../lib/api'
import { membersExport } from '../lib/export'
import { SlackApiError, type CallContext } from '../lib/slack'
import type { Member } from '../lib/types'
import { ExportButtons } from './ExportButtons'

interface Props {
  makeCtx: (signal?: AbortSignal) => CallContext
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading'; count: number }
  | { phase: 'done'; members: Member[] }
  | { phase: 'error'; message: string }

/**
 * Exports the workspace member directory — names, emails, phone numbers.
 *
 * Loading is a separate click from downloading: the walk can take a while on a
 * large workspace, and a download has to start from a click handler, never
 * from the end of an async fetch.
 */
export function MemberExport({ makeCtx }: Props) {
  const { t, n } = useI18n()
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [includeInactive, setIncludeInactive] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  async function load() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ phase: 'loading', count: 0 })
    try {
      const members = await listMembers(makeCtx(controller.signal), (count) => {
        if (!controller.signal.aborted) setState({ phase: 'loading', count })
      })
      if (!controller.signal.aborted) setState({ phase: 'done', members })
    } catch (error) {
      if (controller.signal.aborted) return
      setState({
        phase: 'error',
        message:
          error instanceof SlackApiError
            ? error.code === 'missing_scope'
              ? t.members.errMissingScope(error.needed ?? 'users:read')
              : t.members.errFailed(error.code)
            : t.members.errUnreachable,
      })
    }
  }

  const all = useMemo(() => (state.phase === 'done' ? state.members : []), [state])
  const members = useMemo(
    () => (includeInactive ? all : all.filter((member) => !member.isBot && !member.isDeleted)),
    [all, includeInactive],
  )
  const withEmail = members.filter((member) => member.email).length
  const withPhone = members.filter((member) => member.phone).length
  // Slack drops `email` silently without users:read.email; every human having
  // none is the tell. Bots never have one, so they do not count either way.
  const emailScopeMissing = state.phase === 'done' && all.some((m) => !m.isBot) && all.every((m) => !m.email)

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <header className="panel-head">
        <h2>{t.members.title}</h2>
        <div className="spacer" />
        {state.phase === 'loading' && <span className="hint">{t.members.loading(n(state.count))}</span>}
      </header>

      <div className="panel-body">
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          {t.members.intro}
        </p>
        <p className="note warn">{t.members.privacy}</p>

        {state.phase === 'error' && <p className="note danger">{state.message}</p>}
        {emailScopeMissing && (
          <p className="note warn">{t.members.emailScopeMissing(<code className="inline">users:read.email</code>)}</p>
        )}

        <div className="row">
          <button
            type="button"
            className="btn ghost sm"
            disabled={state.phase === 'loading'}
            onClick={() => void load()}
          >
            {state.phase === 'done' ? t.members.reload : t.members.load}
          </button>
          {state.phase === 'done' && (
            <>
              <label className="hint" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                />
                {t.members.includeInactive}
              </label>
              <span className="hint">{t.members.summary(n(members.length), n(withEmail), n(withPhone))}</span>
              <ExportButtons
                label={t.members.exportLabel}
                kind="members"
                disabled={members.length === 0}
                build={(format) => membersExport(members, format)}
              />
            </>
          )}
        </div>
      </div>
    </section>
  )
}
