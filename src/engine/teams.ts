import { RuleError } from "./errors";
import { shuffle } from "./rng";
import type { Ctx, GameState, PlayerState } from "./types";

/**
 * Team play: teams are pairs. Partners sit opposite each other, see each other's cards,
 * and a round is won by the team of whoever goes out.
 */

export const TEAM_SIZE = 2;

/** One colour per team (never a card colour, so it can't be mistaken for one). */
export const TEAM_COLORS = ["#16c7e0", "#ff8a1f", "#ff4fa3", "#8fdc3b", "#a07bff"] as const;

/** A player's team colour in team play (teams are numbered by seat order), or null. */
export function teamColor(view: { settings: { teamPlay?: boolean }; players: { id: string; partnerId: string | null }[] }, pid: string): string | null {
  if (!view.settings.teamPlay) return null;
  const order: string[] = [];
  for (const p of view.players) {
    if (!p.partnerId) continue;
    const key = [p.id, p.partnerId].sort().join("+");
    if (!order.includes(key)) order.push(key);
  }
  const me = view.players.find((p) => p.id === pid);
  if (!me?.partnerId) return null;
  const i = order.indexOf([me.id, me.partnerId].sort().join("+"));
  return i < 0 ? null : TEAM_COLORS[i % TEAM_COLORS.length];
}

export const MIN_TEAM_PLAYERS = 4;

export function teamPlay(state: GameState): boolean {
  return !!state.settings.teamPlay;
}

export function partnerOf(state: GameState, p: PlayerState): PlayerState | undefined {
  if (!teamPlay(state) || !p.partnerId) return undefined;
  return state.players.find((q) => q.id === p.partnerId);
}

/** Stable id for a player's team (the player alone when unpaired or not in team play). */
export function teamKey(state: GameState, p: PlayerState): string {
  const partner = partnerOf(state, p);
  return partner ? [p.id, partner.id].sort().join("+") : p.id;
}

export function sameTeam(state: GameState, a: PlayerState, b: PlayerState): boolean {
  return a === b || teamKey(state, a) === teamKey(state, b);
}

/** Everyone on `p`'s team, `p` first. */
export function teamOf(state: GameState, p: PlayerState): PlayerState[] {
  const partner = partnerOf(state, p);
  return partner ? [p, partner] : [p];
}

export function invitesOf(state: GameState) {
  return (state.invites ??= []);
}

/** Pairs two players and drops every invitation that involved either of them. */
export function pair(ctx: Ctx, a: PlayerState, b: PlayerState) {
  a.partnerId = b.id;
  b.partnerId = a.id;
  ctx.state.invites = invitesOf(ctx.state).filter((i) => ![a.id, b.id].includes(i.from) && ![a.id, b.id].includes(i.to));
  ctx.events.push({ t: "team_paired", a: a.id, b: b.id });
}

/** Breaks `p`'s pair (if any) and drops their invitations. */
export function unpair(state: GameState, p: PlayerState) {
  const partner = state.players.find((q) => q.id === p.partnerId);
  if (partner) partner.partnerId = null;
  p.partnerId = null;
  state.invites = invitesOf(state).filter((i) => i.from !== p.id && i.to !== p.id);
}

export function clearTeams(state: GameState) {
  for (const p of state.players) p.partnerId = null;
  state.invites = [];
}

/**
 * Before a game in team play: fix stale pairs, pair whoever is left (randomly), and seat
 * partners opposite each other: [A1, B1, C1, A2, B2, C2].
 */
export function arrangeTeams(ctx: Ctx) {
  const { state } = ctx;
  const players = state.players;
  if (players.length < MIN_TEAM_PLAYERS || players.length % TEAM_SIZE !== 0) {
    throw new RuleError("Team play needs an even number of players (4–10): add a bot or remove one");
  }
  const ids = new Set(players.map((p) => p.id));
  for (const p of players) if (p.partnerId && !ids.has(p.partnerId)) p.partnerId = null;
  const loose = shuffle(
    players.filter((p) => !p.partnerId),
    ctx.rng,
  );
  for (let i = 0; i + 1 < loose.length; i += 2) pair(ctx, loose[i], loose[i + 1]);
  state.invites = [];

  const teams: PlayerState[][] = [];
  const placed = new Set<string>();
  for (const p of players) {
    if (placed.has(p.id)) continue;
    const partner = players.find((q) => q.id === p.partnerId)!;
    teams.push([p, partner]);
    placed.add(p.id).add(partner.id);
  }
  state.players = [...teams.map((t) => t[0]), ...teams.map((t) => t[1])];
}
