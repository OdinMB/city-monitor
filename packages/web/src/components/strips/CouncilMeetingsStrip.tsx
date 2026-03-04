import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useCouncilMeetings } from '../../hooks/useCouncilMeetings.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { CouncilMeeting } from '../../lib/api.js';

const FRESH_MAX_AGE = 12 * 60 * 60 * 1000; // 12h (cron every 6h)

// ── Helpers ──────────────────────────────────────────────────────

function dayKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayHeader(isoDate: string, t: (key: string) => string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const meetingDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (meetingDay.getTime() === today.getTime()) return t('panel.councilMeetings.today');
  if (meetingDay.getTime() === tomorrow.getTime()) return t('panel.councilMeetings.tomorrow');

  return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(meetings: CouncilMeeting[]): Array<{ day: string; meetings: CouncilMeeting[] }> {
  const groups: Map<string, CouncilMeeting[]> = new Map();
  for (const m of meetings) {
    const key = dayKey(m.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, meetings: items }));
}

type MeetingFilter = string;
const PARLIAMENT_KEY = 'parliament';

// ── Meeting row ─────────────────────────────────────────────────

function MeetingRow({ meeting, t }: { meeting: CouncilMeeting; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const isBvv = meeting.source === 'bvv';
  const sourceBadge = isBvv ? t('panel.councilMeetings.bvv') : t('panel.councilMeetings.parliament');
  const badgeColor = isBvv
    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
    : 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400';

  return (
    <div className="py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeColor}`}>
              {sourceBadge}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              {formatTime(meeting.start)}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5 line-clamp-2">
            {meeting.committee}
          </p>
          {meeting.district && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{meeting.district}</p>
          )}
          {meeting.location && (
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{meeting.location}</p>
          )}
        </div>
        {meeting.webUrl && (
          <a
            href={meeting.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-1"
            aria-label="Open meeting details"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
      {meeting.agendaItems && meeting.agendaItems.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {t('panel.councilMeetings.agendaItems', { count: meeting.agendaItems.length })}
        </p>
      )}
    </div>
  );
}

// ── Main strip ──────────────────────────────────────────────────

export function CouncilMeetingsStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useCouncilMeetings(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);
  const [filter, setFilter] = useState<MeetingFilter>(PARLIAMENT_KEY);

  const allMeetings = useMemo(() => data ?? [], [data]);

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMeetings) {
      if (m.district) set.add(m.district);
    }
    return [...set].sort();
  }, [allMeetings]);

  const filtered = useMemo(() => {
    if (filter === PARLIAMENT_KEY) return allMeetings.filter((m) => m.source === 'parliament');
    return allMeetings.filter((m) => m.district === filter);
  }, [allMeetings, filter]);

  if (isLoading) return <Skeleton lines={3} />;
  if (isError) return <StripErrorFallback domain="Council Meetings" onRetry={refetch} />;
  if (!allMeetings.length) return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.councilMeetings.empty')}</p>;

  const dayGroups = groupByDay(filtered);

  return (
    <>
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label={t('panel.councilMeetings.filterLabel')}
        className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value={PARLIAMENT_KEY}>
          {t('panel.councilMeetings.parliament')}
        </option>
        {districts.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <div className="flex-1 min-h-0 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">{t('panel.councilMeetings.empty')}</p>
        ) : (
          dayGroups.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm px-1 py-1.5 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  {formatDayHeader(group.meetings[0].start, t)}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">{group.meetings.length}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {group.meetings.map((meeting) => (
                  <MeetingRow key={meeting.id} meeting={meeting} t={t} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
