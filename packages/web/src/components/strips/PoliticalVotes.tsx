import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPartyColor } from '../../lib/party-colors.js';
import { safeUrl } from '../../lib/safe-url.js';
import { formatCount } from '../../lib/format-value.js';
import { SourceText } from '../SourceText.js';
import type { PoliticalVote, VoteChoice, VoteCounts } from '../../lib/api.js';

/** The vote values in the order the tile lists them, with their colour. */
const CHOICES: ReadonlyArray<{ choice: VoteChoice; field: keyof VoteCounts; dot: string }> = [
  { choice: 'yes', field: 'yes', dot: 'bg-emerald-600 dark:bg-emerald-400' },
  { choice: 'no', field: 'no', dot: 'bg-red-600 dark:bg-red-400' },
  { choice: 'abstain', field: 'abstain', dot: 'bg-amber-500 dark:bg-amber-400' },
  { choice: 'no_show', field: 'noShow', dot: 'bg-gray-400 dark:bg-gray-500' },
];

const DOT: Record<VoteChoice, string> = Object.fromEntries(CHOICES.map((c) => [c.choice, c.dot])) as Record<VoteChoice, string>;

function formatPollDate(date: string, lang: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Counts({ counts }: { counts: VoteCounts }) {
  const { t, i18n } = useTranslation();
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {CHOICES.map(({ choice, field, dot }) => (
        <span key={choice} className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
          {t(`panel.political.votes.choice.${choice}`)} {formatCount(counts[field], i18n.language)}
        </span>
      ))}
    </span>
  );
}

function PollRow({ vote }: { vote: PoliticalVote }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const result = vote.accepted === null ? null : t(`panel.political.votes.${vote.accepted ? 'accepted' : 'rejected'}`);
  return (
    <li className="py-1.5 px-1.5 text-[11px]">
      <a href={safeUrl(vote.url)} target="_blank" rel="noopener noreferrer" className="text-link font-medium hover:underline">
        <SourceText as="span" className="line-clamp-2">{vote.title}</SourceText>
      </a>
      <div className="text-muted mt-0.5">
        {formatPollDate(vote.date, i18n.language)}
        {result && (
          <>
            {' · '}
            <span className={vote.accepted ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>{result}</span>
          </>
        )}
        {' · '}
        {t('panel.political.votes.overall', {
          yes: formatCount(vote.totals.yes, i18n.language),
          no: formatCount(vote.totals.no, i18n.language),
        })}
      </div>
      {vote.members.length > 0 && (
        <>
          <div className="mt-1 text-gray-700 dark:text-gray-300">
            <span className="text-muted">{t('panel.political.votes.cityMembers')} </span>
            <Counts counts={vote.city} />
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center min-h-6 text-link hover:underline cursor-pointer"
          >
            {t(open ? 'panel.political.votes.hideMembers' : 'panel.political.votes.showMembers')}
          </button>
          {open && (
            <ul id={listId} className="mt-0.5 divide-y divide-gray-100 dark:divide-gray-800">
              {vote.members.map((m) => (
                <li key={`${m.name}-${m.party}`} className="flex items-center gap-1.5 py-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(m.party) }} />
                  <SourceText as="span" className="truncate">{m.name}</SourceText>
                  <span className="text-muted shrink-0">{m.party}</span>
                  <span className="ms-auto shrink-0 inline-flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${DOT[m.vote]}`} aria-hidden="true" />
                    {t(`panel.political.votes.choice.${m.vote}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/**
 * The parliament's latest roll-call votes: topic, date, result and the city's
 * members' yes/no/abstain/absent counts, each expandable to the members. The
 * collapsed tile shows the newest only.
 */
export function PoliticalVotes({ votes, expanded, onExpand }: { votes: PoliticalVote[]; expanded: boolean; onExpand?: () => void }) {
  const { t } = useTranslation();
  if (votes.length === 0) return null;
  const shown = expanded ? votes : votes.slice(0, 1);
  const remaining = votes.length - shown.length;
  return (
    <section className="mt-2 border-t border-gray-100 dark:border-gray-800 pt-1.5" aria-label={t('panel.political.votes.title')}>
      <h3 className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 px-1.5">{t('panel.political.votes.title')}</h3>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {shown.map((v) => <PollRow key={v.id} vote={v} />)}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onExpand}
          className="w-full py-1 px-1.5 text-xs text-link hover:underline text-start cursor-pointer"
        >
          {t('panel.political.showMore', { count: remaining })}
        </button>
      )}
    </section>
  );
}
