import { describe, it, expect } from 'vitest';
import { tallyPoll, voteChoice, type AwPoll } from './political-votes.js';

const POLL: AwPoll = {
  id: 6733,
  label: 'Änderung des Brennstoffemissionshandelsgesetzes (CO₂-Preis)',
  abgeordnetenwatch_url: 'https://www.abgeordnetenwatch.de/bundestag/21/abstimmungen/x',
  field_accepted: true,
  field_poll_date: '2026-10-16',
  field_topics: [{ label: 'Energie' }, { label: 'Umwelt' }],
};

describe('voteChoice', () => {
  it('keeps the four values and counts anything else as absent', () => {
    expect(['yes', 'no', 'abstain', 'no_show', 'unknown'].map(voteChoice))
      .toEqual(['yes', 'no', 'abstain', 'no_show', 'no_show']);
  });
});

describe('tallyPoll', () => {
  const members = new Map([
    [1, { name: 'Zora Zett', party: 'SPD' }],
    [2, { name: 'Anna Alpha', party: 'SPD' }],
    [3, { name: 'Carl Cee', party: 'CDU' }],
    [4, { name: 'Not Voting', party: 'Grüne' }],
  ]);

  it('counts the whole parliament and the city members, sorted by party then name', () => {
    const vote = tallyPoll(POLL, 'bundestag', [
      { mandate: { id: 1 }, vote: 'yes' },
      { mandate: { id: 2 }, vote: 'abstain' },
      { mandate: { id: 3 }, vote: 'no_show' },
      { mandate: { id: 99 }, vote: 'no' },
      { mandate: null, vote: 'yes' },
    ], members);

    expect(vote).toEqual({
      id: 6733,
      parliament: 'bundestag',
      title: POLL.label,
      date: '2026-10-16',
      accepted: true,
      topics: ['Energie', 'Umwelt'],
      url: POLL.abgeordnetenwatch_url,
      totals: { yes: 2, no: 1, abstain: 1, noShow: 1 },
      city: { yes: 1, no: 0, abstain: 1, noShow: 1 },
      members: [
        { name: 'Carl Cee', party: 'CDU', vote: 'no_show' },
        { name: 'Anna Alpha', party: 'SPD', vote: 'abstain' },
        { name: 'Zora Zett', party: 'SPD', vote: 'yes' },
      ],
    });
  });

  it('gives no result when abgeordnetenwatch has none, and no topics when there are none', () => {
    const vote = tallyPoll({ ...POLL, field_accepted: null, field_topics: null }, 'state', [], members);
    expect(vote.accepted).toBeNull();
    expect(vote.topics).toEqual([]);
    expect(vote.members).toEqual([]);
  });
});
