/**
 * SignSpark accounts, XP and friends.
 *
 * Every table is private and every procedure is admin-only: the FastAPI
 * backend is the sole client, calling over HTTP with the publisher's token.
 * Python keeps password hashing, cookies and curriculum checks; this module
 * keeps the rules that must hold atomically (unique names, the XP ladder,
 * friend request state, cascade deletes, leaderboard visibility).
 *
 * Failures throw SenderError with a short code the backend maps to HTTP.
 */
import { schema, table, t, SenderError, type InferSchema } from 'spacetimedb/server';
import { Timestamp, type Identity } from 'spacetimedb';
import type { TransactionCtx } from 'spacetimedb/server';

const SESSION_MICROS = 30n * 86_400n * 1_000_000n;
const XP_LADDER = [10, 5, 2];

const admin = table({ name: 'admin' }, { identity: t.identity().primaryKey() });

const user = table(
  { name: 'user' },
  {
    id: t.u64().primaryKey().autoInc(),
    displayName: t.string(),
    nameKey: t.string().unique(), // lowercased displayName: case-insensitive uniqueness
    passwordHash: t.string(),
    leaderboardVisible: t.bool(),
    friendsOnly: t.bool(),
    xp: t.u32(), // running total of this user's xp_event points
    createdAt: t.timestamp(),
  }
);

const session = table(
  { name: 'session' },
  {
    tokenHash: t.string().primaryKey(),
    userId: t.u64().index('btree'),
    expiresAt: t.timestamp(),
  }
);

const xpEvent = table(
  {
    name: 'xp_event',
    indexes: [{ accessor: 'byUserLessonSign', algorithm: 'btree', columns: ['userId', 'lessonId', 'sign'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.u64(),
    lessonId: t.string(),
    sign: t.string(),
    awardIndex: t.u8(),
    points: t.u8(),
    createdAt: t.timestamp(),
  }
);

// One row per pair of learners, stored with lowId < highId.
const friendship = table(
  { name: 'friendship' },
  {
    pairKey: t.string().primaryKey(), // `${lowId}:${highId}`
    lowId: t.u64().index('btree'),
    highId: t.u64().index('btree'),
    senderId: t.u64(),
    accepted: t.bool(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({ admin, user, session, xpEvent, friendship });
export default spacetimedb;

type Tx = TransactionCtx<InferSchema<typeof spacetimedb>>;
type UserRow = NonNullable<ReturnType<Tx['db']['user']['id']['find']>>;

const Profile = t.object('Profile', {
  id: t.u64(),
  displayName: t.string(),
  xp: t.u32(),
  leaderboardVisible: t.bool(),
  friendsOnly: t.bool(),
});
const Credentials = t.object('Credentials', { userId: t.u64(), passwordHash: t.string() });
const LeaderboardRow = t.object('LeaderboardRow', {
  rank: t.u32(),
  displayName: t.string(),
  xp: t.u32(),
  you: t.bool(),
});
const FriendRow = t.object('FriendRow', { displayName: t.string(), accepted: t.bool(), incoming: t.bool() });

function requireAdmin(tx: Tx, sender: Identity) {
  if (!tx.db.admin.identity.find(sender)) throw new SenderError('forbidden');
}

function profileOf(u: UserRow) {
  return {
    id: u.id,
    displayName: u.displayName,
    xp: u.xp,
    leaderboardVisible: u.leaderboardVisible,
    friendsOnly: u.friendsOnly,
  };
}

function getUser(tx: Tx, userId: bigint): UserRow {
  const u = tx.db.user.id.find(userId);
  if (!u) throw new SenderError('no_user');
  return u;
}

function pairKey(a: bigint, b: bigint) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function friendshipsOf(tx: Tx, userId: bigint) {
  return [...tx.db.friendship.lowId.filter(userId), ...tx.db.friendship.highId.filter(userId)];
}

function issueSession(tx: Tx, userId: bigint, tokenHash: string) {
  const expiresAt = new Timestamp(tx.timestamp.microsSinceUnixEpoch + SESSION_MICROS);
  tx.db.session.insert({ tokenHash, userId, expiresAt });
}

// The publisher becomes the admin, so the backend uses the publisher's token.
export const init = spacetimedb.init(ctx => {
  ctx.db.admin.insert({ identity: ctx.sender });
});

export const register = spacetimedb.procedure(
  { displayName: t.string(), passwordHash: t.string(), tokenHash: t.string() },
  Profile,
  (ctx, { displayName, passwordHash, tokenHash }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const nameKey = displayName.toLowerCase();
      if (tx.db.user.nameKey.find(nameKey)) throw new SenderError('name_taken');
      const u = tx.db.user.insert({
        id: 0n,
        displayName,
        nameKey,
        passwordHash,
        leaderboardVisible: false,
        friendsOnly: false,
        xp: 0,
        createdAt: tx.timestamp,
      });
      issueSession(tx, u.id, tokenHash);
      return profileOf(u);
    })
);

export const credentials = spacetimedb.procedure(
  { displayName: t.string() },
  t.option(Credentials),
  (ctx, { displayName }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const u = tx.db.user.nameKey.find(displayName.toLowerCase());
      return u ? { userId: u.id, passwordHash: u.passwordHash } : undefined;
    })
);

export const createSession = spacetimedb.procedure(
  { userId: t.u64(), tokenHash: t.string() },
  Profile,
  (ctx, { userId, tokenHash }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const u = getUser(tx, userId);
      issueSession(tx, userId, tokenHash);
      return profileOf(u);
    })
);

export const sessionUser = spacetimedb.procedure(
  { tokenHash: t.string() },
  t.option(Profile),
  (ctx, { tokenHash }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const s = tx.db.session.tokenHash.find(tokenHash);
      if (!s) return undefined;
      if (s.expiresAt.microsSinceUnixEpoch <= tx.timestamp.microsSinceUnixEpoch) {
        tx.db.session.tokenHash.delete(tokenHash);
        return undefined;
      }
      const u = tx.db.user.id.find(s.userId);
      return u ? profileOf(u) : undefined;
    })
);

export const endSession = spacetimedb.procedure({ tokenHash: t.string() }, t.unit(), (ctx, { tokenHash }) =>
  ctx.withTx(tx => {
    requireAdmin(tx, ctx.sender);
    tx.db.session.tokenHash.delete(tokenHash);
    return {};
  })
);

export const setPrivacy = spacetimedb.procedure(
  { userId: t.u64(), visible: t.bool(), friendsOnly: t.bool() },
  Profile,
  (ctx, { userId, visible, friendsOnly }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const u = tx.db.user.id.update({
        ...getUser(tx, userId),
        leaderboardVisible: visible,
        friendsOnly: visible && friendsOnly,
      });
      return profileOf(u);
    })
);

export const deleteUser = spacetimedb.procedure({ userId: t.u64() }, t.unit(), (ctx, { userId }) =>
  ctx.withTx(tx => {
    requireAdmin(tx, ctx.sender);
    tx.db.session.userId.delete(userId);
    tx.db.xpEvent.byUserLessonSign.delete(userId);
    for (const f of friendshipsOf(tx, userId)) tx.db.friendship.pairKey.delete(f.pairKey);
    tx.db.user.id.delete(userId);
    return {};
  })
);

/** Awards points for one accepted sign; repeats in a lesson pay 10, 5, 2, then 0. */
export const awardXp = spacetimedb.procedure(
  { userId: t.u64(), lessonId: t.string(), sign: t.string() },
  t.u8(),
  (ctx, { userId, lessonId, sign }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const u = getUser(tx, userId);
      const previous = [...tx.db.xpEvent.byUserLessonSign.filter([userId, lessonId, sign])].length;
      const points = XP_LADDER[previous] ?? 0;
      if (points) {
        tx.db.xpEvent.insert({
          id: 0n,
          userId,
          lessonId,
          sign,
          awardIndex: previous,
          points,
          createdAt: tx.timestamp,
        });
        tx.db.user.id.update({ ...u, xp: u.xp + points });
      }
      return points;
    })
);

/** Visible learners: yourself, public learners, and friends-only learners you're friends with. */
export const leaderboard = spacetimedb.procedure({ userId: t.u64() }, t.array(LeaderboardRow), (ctx, { userId }) =>
  ctx.withTx(tx => {
    requireAdmin(tx, ctx.sender);
    const friendIds = new Set(
      friendshipsOf(tx, userId)
        .filter(f => f.accepted)
        .map(f => (f.lowId === userId ? f.highId : f.lowId))
    );
    return [...tx.db.user.iter()]
      .filter(u => u.leaderboardVisible && (u.id === userId || !u.friendsOnly || friendIds.has(u.id)))
      .sort((a, b) => b.xp - a.xp || a.nameKey.localeCompare(b.nameKey))
      .slice(0, 100)
      .map((u, i) => ({ rank: i + 1, displayName: u.displayName, xp: u.xp, you: u.id === userId }));
  })
);

export const friends = spacetimedb.procedure({ userId: t.u64() }, t.array(FriendRow), (ctx, { userId }) =>
  ctx.withTx(tx => {
    requireAdmin(tx, ctx.sender);
    return friendshipsOf(tx, userId)
      .map(f => ({ f, other: getUser(tx, f.lowId === userId ? f.highId : f.lowId) }))
      .sort((a, b) => Number(a.f.accepted) - Number(b.f.accepted) || a.other.nameKey.localeCompare(b.other.nameKey))
      .map(({ f, other }) => ({
        displayName: other.displayName,
        accepted: f.accepted,
        incoming: !f.accepted && f.senderId !== userId,
      }));
  })
);

/** Sends a request, or accepts the other learner's pending request to you. */
export const requestFriend = spacetimedb.procedure(
  { userId: t.u64(), displayName: t.string() },
  t.unit(),
  (ctx, { userId, displayName }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const other = tx.db.user.nameKey.find(displayName.toLowerCase());
      if (!other || other.id === userId) throw new SenderError('no_match');
      const key = pairKey(userId, other.id);
      const existing = tx.db.friendship.pairKey.find(key);
      if (existing?.accepted) throw new SenderError('already_friends');
      if (existing?.senderId === userId) throw new SenderError('already_sent');
      if (existing) {
        tx.db.friendship.pairKey.update({ ...existing, accepted: true });
      } else {
        const [lowId, highId] = userId < other.id ? [userId, other.id] : [other.id, userId];
        tx.db.friendship.insert({ pairKey: key, lowId, highId, senderId: userId, accepted: false, createdAt: tx.timestamp });
      }
      return {};
    })
);

export const removeFriend = spacetimedb.procedure(
  { userId: t.u64(), displayName: t.string() },
  t.unit(),
  (ctx, { userId, displayName }) =>
    ctx.withTx(tx => {
      requireAdmin(tx, ctx.sender);
      const other = tx.db.user.nameKey.find(displayName.toLowerCase());
      if (other) tx.db.friendship.pairKey.delete(pairKey(userId, other.id));
      return {};
    })
);
