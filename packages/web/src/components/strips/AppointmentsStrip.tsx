/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useAppointments } from '../../hooks/useAppointments.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { BuergeramtService } from '../../lib/api.js';

const STATUS_COLORS: Record<BuergeramtService['status'], string> = {
  available: '#22c55e',
  scarce: '#f59e0b',
  none: '#ef4444',
  unknown: '#9ca3af',
};

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00Z');
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 86_400_000));
}

function ServiceRow({ service, t }: { service: BuergeramtService; t: (k: string, opts?: Record<string, unknown>) => string }) {
  const color = STATUS_COLORS[service.status];
  const statusKey = service.status;
  const days = service.earliestDate ? daysUntil(service.earliestDate) : null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Status dot */}
      <span
        className="shrink-0 w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />

      {/* Service name */}
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
        {t(`panel.appointments.service.${service.serviceId}`, { defaultValue: service.name })}
      </span>

      {/* Days until / status */}
      <span className="shrink-0 text-xs tabular-nums" style={{ color }}>
        {statusKey === 'unknown'
          ? '—'
          : days != null
            ? days === 0
              ? t('panel.appointments.today')
              : t('panel.appointments.inDays', { count: days })
            : t('panel.appointments.noSlots')}
      </span>
    </div>
  );
}

export function AppointmentsStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useAppointments(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton lines={4} />;
  }

  if (!data || data.services.length === 0) {
    return (
      <div className="text-center py-2">
        <p className="text-sm text-gray-400">{t('panel.appointments.empty')}</p>
        <a
          href="https://service.berlin.de/terminvereinbarung/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline mt-1 inline-block"
        >
          {t('panel.appointments.bookAppointment')} →
        </a>
      </div>
    );
  }

  // Overall summary: worst status across all services
  const hasNone = data.services.some((s) => s.status === 'none');
  const allUnknown = data.services.every((s) => s.status === 'unknown');
  const hasScarce = data.services.some((s) => s.status === 'scarce');

  const summaryKey = allUnknown
    ? 'unknown'
    : hasNone
      ? 'someUnavailable'
      : hasScarce
        ? 'someScarce'
        : 'allAvailable';

  const summaryColor = allUnknown
    ? 'text-gray-400'
    : hasNone
      ? 'text-red-500 dark:text-red-400'
      : hasScarce
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-green-600 dark:text-green-400';

  return (
    <div className="space-y-2.5">
      {/* Summary */}
      <p className={`text-sm text-center font-medium ${summaryColor}`}>
        {t(`panel.appointments.summary.${summaryKey}`)}
      </p>

      {/* Service rows */}
      {data.services.map((service) => (
        <ServiceRow key={service.serviceId} service={service} t={t} />
      ))}

      {/* Booking link */}
      <div className="pt-1 text-center">
        <a
          href={data.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline"
        >
          {t('panel.appointments.bookAppointment')} →
        </a>
      </div>
    </div>
  );
}
