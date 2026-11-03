/**
 * Roll-call votes from abgeordnetenwatch.de (API v2, CC0 1.0): one poll and
 * its votes tallied into the parliament's result and the city's members'.
 */
import type { PoliticalVote, VoteChoice, VoteCounts } from '@city-monitor/shared';

/** The fields of an abgeordnetenwatch `polls` entry the tile uses. */
export interface AwPoll {
  id: number;
  label: string;
  abgeordnetenwatch_url: string;
  field_accepted?: boolean | null;
  field_poll_date: string;
  field_topics?: Array<{ label: string }> | null;
}

/** The fields of an abgeordnetenwatch `votes` entry the tile uses. */
export interface AwVote {
  mandate: { id: number } | null;
  vote: string;
}

/** A member of the city, keyed by mandate id in the map tallyPoll takes. */
export interface CityMember {
  name: string;
  party: string;
}

/** How many roll-call votes per parliament the tile shows. */
export const POLLS_PER_PARLIAMENT = 3;

/** abgeordnetenwatch's vote values; anything else counts as absent. */
export function voteChoice(raw: string): VoteChoice {
  return raw === 'yes' || raw === 'no' || raw === 'abstain' ? raw : 'no_show';
}

function countField(choice: VoteChoice): keyof VoteCounts {
  return choice === 'no_show' ? 'noShow' : choice;
}

function emptyCounts(): VoteCounts {
  return { yes: 0, no: 0, abstain: 0, noShow: 0 };
}

/**
 * The poll's result over all votes, and the votes of the city's members
 * (matched by mandate id), sorted by party then name. A city member with no
 * vote on record is left out rather than counted absent: they may have joined
 * the parliament after the vote.
 */
export function tallyPoll(
  poll: AwPoll,
  parliament: PoliticalVote['parliament'],
  votes: readonly AwVote[],
  members: ReadonlyMap<number, CityMember>,
): PoliticalVote {
  const totals = emptyCounts();
  const city = emptyCounts();
  const cityMembers: PoliticalVote['members'] = [];
  for (const v of votes) {
    const choice = voteChoice(v.vote);
    totals[countField(choice)]++;
    const member = v.mandate ? members.get(v.mandate.id) : undefined;
    if (!member) continue;
    city[countField(choice)]++;
    cityMembers.push({ name: member.name, party: member.party, vote: choice });
  }
  cityMembers.sort((a, b) => a.party.localeCompare(b.party, 'de') || a.name.localeCompare(b.name, 'de'));
  return {
    id: poll.id,
    parliament,
    title: poll.label,
    date: poll.field_poll_date,
    accepted: typeof poll.field_accepted === 'boolean' ? poll.field_accepted : null,
    topics: (poll.field_topics ?? []).map((t) => t.label),
    url: poll.abgeordnetenwatch_url,
    totals,
    city,
    members: cityMembers,
  };
}
