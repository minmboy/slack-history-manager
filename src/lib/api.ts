/** Typed wrappers over the Slack methods this app needs. */
import { slackCall, slackPaginate, type CallContext } from './slack'
import type { Conversation, ConversationKind, Identity, Member, SlackUser } from './types'

/** Selectable conversation types and the user scopes each one needs. Labels live in the dictionary. */
export const CONVERSATION_TYPES: { kind: ConversationKind; scopes: string[] }[] = [
  { kind: 'im', scopes: ['im:read', 'im:history'] },
  { kind: 'mpim', scopes: ['mpim:read', 'mpim:history'] },
  { kind: 'private_channel', scopes: ['groups:read', 'groups:history'] },
  { kind: 'public_channel', scopes: ['channels:read', 'channels:history'] },
]

export async function authTest(ctx: CallContext): Promise<Identity> {
  const res = await slackCall<{
    user_id: string
    team_id: string
    user: string
    team: string
    url: string
  }>('auth.test', 4, {}, ctx)
  return {
    userId: res.user_id,
    teamId: res.team_id,
    userName: res.user,
    teamName: res.team,
    teamUrl: res.url,
  }
}

export async function authRevoke(ctx: CallContext): Promise<boolean> {
  const res = await slackCall<{ revoked: boolean }>('auth.revoke', 3, {}, ctx)
  return res.revoked === true
}

interface RawConversation {
  id: string
  user?: string
  name?: string
  is_archived?: boolean
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  is_user_deleted?: boolean
}

/**
 * Lists conversations of the requested kinds. Slack returns them all from one
 * cursor, so we classify each result back into a kind on the way out.
 */
export async function listConversations(
  kinds: ConversationKind[],
  ctx: CallContext,
  onPage?: (total: number) => void,
): Promise<Conversation[]> {
  const out: Conversation[] = []
  const pages = slackPaginate<RawConversation>(
    'conversations.list',
    2,
    { types: kinds.join(','), limit: 1000, exclude_archived: false },
    'channels',
    ctx,
  )

  for await (const page of pages) {
    for (const raw of page) {
      const kind: ConversationKind = raw.is_im
        ? 'im'
        : raw.is_mpim
          ? 'mpim'
          : raw.is_private
            ? 'private_channel'
            : 'public_channel'
      if (!kinds.includes(kind)) continue
      out.push({
        id: raw.id,
        kind,
        partnerId: raw.user,
        label: raw.name ? `#${raw.name}` : (raw.user ?? raw.id),
        labelResolved: Boolean(raw.name),
        isArchived: raw.is_archived,
      })
    }
    onPage?.(out.length)
  }
  return out
}

interface RawUser {
  id: string
  name?: string
  real_name?: string
  deleted?: boolean
  is_bot?: boolean
  is_admin?: boolean
  is_restricted?: boolean
  is_ultra_restricted?: boolean
  tz?: string
  profile?: { display_name?: string; real_name?: string; email?: string; phone?: string; title?: string }
}

function toUser(raw: RawUser): SlackUser {
  const display = raw.profile?.display_name?.trim()
  const real = raw.profile?.real_name?.trim() || raw.real_name?.trim()
  return {
    id: raw.id,
    displayName: display || real || raw.name || raw.id,
    realName: real || raw.name || raw.id,
    isBot: Boolean(raw.is_bot),
    isDeleted: Boolean(raw.deleted),
  }
}

/**
 * Streams the member directory a page at a time so DM names can fill in
 * progressively instead of blocking the picker on a full walk.
 */
export async function* streamUsers(ctx: CallContext, maxPages = 30): AsyncGenerator<SlackUser[]> {
  const pages = slackPaginate<RawUser>('users.list', 2, { limit: 1000 }, 'members', ctx, maxPages)
  for await (const page of pages) yield page.map(toUser)
}

function toMember(raw: RawUser): Member {
  const user = toUser(raw)
  return {
    id: raw.id,
    name: raw.name ?? '',
    displayName: user.displayName,
    realName: user.realName,
    email: raw.profile?.email?.trim() ?? '',
    phone: raw.profile?.phone?.trim() ?? '',
    title: raw.profile?.title?.trim() ?? '',
    // Slackbot is listed as a regular member, not a bot.
    isBot: user.isBot || raw.id === 'USLACKBOT',
    isDeleted: user.isDeleted,
    isGuest: Boolean(raw.is_restricted || raw.is_ultra_restricted),
    isAdmin: Boolean(raw.is_admin),
    tz: raw.tz ?? '',
  }
}

/**
 * Walks the whole member directory for export. Unlike `streamUsers`, which only
 * needs enough pages to name the DMs in the picker, this has no page cap: an
 * export that silently stopped at 30,000 members would read as complete.
 *
 * Slack leaves `profile.email` out, without an error, when the token lacks
 * `users:read.email` — the caller has to notice the column came back empty.
 */
export async function listMembers(ctx: CallContext, onPage?: (total: number) => void): Promise<Member[]> {
  const out: Member[] = []
  for await (const page of slackPaginate<RawUser>('users.list', 2, { limit: 1000 }, 'members', ctx)) {
    for (const raw of page) out.push(toMember(raw))
    onPage?.(out.length)
  }
  return out
}

/**
 * Deletes a file outright. A file is global: this removes it from every
 * conversation it was ever shared into, not just the one it was found in.
 */
export async function deleteFile(fileId: string, ctx: CallContext): Promise<void> {
  await slackCall('files.delete', 3, { file: fileId }, ctx)
}

export async function fetchUser(userId: string, ctx: CallContext): Promise<SlackUser> {
  const res = await slackCall<{ user: RawUser }>('users.info', 4, { user: userId }, ctx)
  return toUser(res.user)
}
