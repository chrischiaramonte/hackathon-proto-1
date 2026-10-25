export interface AccountProfile {
  id: number;
  displayName: string;
  xp: number;
  leaderboardVisible: boolean;
  friendsOnly: boolean;
}
export interface LeaderboardRow { rank: number; displayName: string; xp: number; you: boolean }
export interface Friend { displayName: string; accepted: boolean; incoming: boolean }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/account${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const accountApi = {
  me: () => call<AccountProfile>('/me'),
  register: (displayName: string, password: string) => call<AccountProfile>('/register', 'POST', { displayName, password }),
  login: (displayName: string, password: string) => call<AccountProfile>('/login', 'POST', { displayName, password }),
  logout: () => call<{ ok: boolean }>('/logout', 'POST'),
  privacy: (visible: boolean, friendsOnly: boolean) => call<AccountProfile>('/privacy', 'PATCH', { visible, friendsOnly }),
  leaderboard: () => call<LeaderboardRow[]>('/leaderboard'),
  friends: () => call<Friend[]>('/friends'),
  requestFriend: (displayName: string) => call<{ ok: boolean }>('/friends/request', 'POST', { displayName }),
  removeFriend: (displayName: string) => call<{ ok: boolean }>(`/friends/${encodeURIComponent(displayName)}`, 'DELETE'),
  deleteAccount: () => call<{ ok: boolean }>('', 'DELETE'),
  translationAnswer: (lessonId: string, sign: string, answer: string) => call<{ correct: boolean; xpAwarded: number }>('/translation-answer', 'POST', { lessonId, sign, answer }),
};
