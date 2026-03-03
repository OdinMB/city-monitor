/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Lucide-to-canvas icon renderer for MapLibre GL map markers.
 * Draws crisp SVG-based icons onto ImageData via Path2D (synchronous).
 */

import { TrainFront, Newspaper, ShieldAlert, Pill, HeartPulse, Wind, Construction, Droplets } from 'lucide';
import type maplibregl from 'maplibre-gl';

export type IconNode = [tag: string, attrs: Record<string, string | number>][];

export const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
};

export const NEWS_CATEGORY_COLORS: Record<string, string> = {
  transit: '#3b82f6',
  politics: '#8b5cf6',
  culture: '#ec4899',
  crime: '#ef4444',
  weather: '#06b6d4',
  economy: '#10b981',
  sports: '#f59e0b',
  local: '#6366f1',
};

export const CONSTRUCTION_SUBTYPE_COLORS: Record<string, string> = {
  construction: '#d97706',
  closure: '#ef4444',
  disruption: '#f97316',
};

export const AQI_LEVEL_COLORS: Record<string, string> = {
  good: '#50C878',
  fair: '#FFD700',
  moderate: '#FF8C00',
  poor: '#FF4444',
  veryPoor: '#8B008B',
  extremelyPoor: '#800000',
};

export const WATER_STATE_COLORS: Record<string, string> = {
  low: '#60a5fa',
  normal: '#22c55e',
  high: '#f59e0b',
  very_high: '#ef4444',
  unknown: '#9ca3af',
};

const ICON_SIZE = 36;

/** Render a single SVG element onto a canvas context */
function drawSVGElement(
  ctx: CanvasRenderingContext2D,
  tag: string,
  attrs: Record<string, string | number>,
) {
  switch (tag) {
    case 'path': {
      const path = new Path2D(String(attrs.d));
      ctx.stroke(path);
      break;
    }
    case 'rect': {
      const x = Number(attrs.x ?? 0);
      const y = Number(attrs.y ?? 0);
      const w = Number(attrs.width);
      const h = Number(attrs.height);
      const rx = Number(attrs.rx ?? 0);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, rx);
      ctx.stroke();
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(Number(attrs.cx), Number(attrs.cy), Number(attrs.r), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(Number(attrs.x1), Number(attrs.y1));
      ctx.lineTo(Number(attrs.x2), Number(attrs.y2));
      ctx.stroke();
      break;
    }
    case 'polyline':
    case 'polygon': {
      const points = String(attrs.points)
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number) as [number, number]);
      if (points.length === 0) break;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      if (tag === 'polygon') ctx.closePath();
      ctx.stroke();
      break;
    }
  }
}

/**
 * Draw a rounded-square background with a white Lucide icon centered inside.
 * Returns ImageData suitable for `map.addImage()`.
 */
export function createMapIcon(
  iconNode: IconNode,
  bgColor: string,
  strokeColor: string,
  size = ICON_SIZE,
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Rounded-square background
  const pad = 2;
  const r = 6;
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - 2 * pad, size - 2 * pad, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Scale and center the Lucide icon (24×24 viewbox → ~55% of size)
  const iconSize = size * 0.55;
  const scale = iconSize / 24;
  const offset = (size - iconSize) / 2;

  ctx.save();
  ctx.translate(offset, offset);
  ctx.scale(scale, scale);

  // Lucide default stroke settings
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [tag, attrs] of iconNode) {
    drawSVGElement(ctx, tag, attrs);
  }

  ctx.restore();

  return ctx.getImageData(0, 0, size, size);
}

/** Register all Lucide-based map icons for every data layer */
export function registerAllMapIcons(map: maplibregl.Map, isDark: boolean) {
  const stroke = isDark ? '#1f2937' : '#ffffff';

  // Transit: TrainFront × 3 severity colors
  for (const [severity, color] of Object.entries(SEVERITY_COLORS)) {
    const id = `transit-icon-${severity}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(TrainFront as IconNode, color, stroke));
  }

  // News: Newspaper × 8 category colors
  for (const [category, color] of Object.entries(NEWS_CATEGORY_COLORS)) {
    const id = `news-icon-${category}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(Newspaper as IconNode, color, stroke));
  }

  // Safety: ShieldAlert, orange
  const safetyId = 'safety-icon';
  if (map.hasImage(safetyId)) map.removeImage(safetyId);
  map.addImage(safetyId, createMapIcon(ShieldAlert as IconNode, '#f97316', stroke));

  // Pharmacy: Pill, green
  const pharmacyId = 'pharmacy-icon';
  if (map.hasImage(pharmacyId)) map.removeImage(pharmacyId);
  map.addImage(pharmacyId, createMapIcon(Pill as IconNode, '#22c55e', stroke));

  // AED: HeartPulse, red
  const aedId = 'aed-icon';
  if (map.hasImage(aedId)) map.removeImage(aedId);
  map.addImage(aedId, createMapIcon(HeartPulse as IconNode, '#ef4444', stroke));

  // Construction: Construction × 3 subtype colors
  for (const [subtype, color] of Object.entries(CONSTRUCTION_SUBTYPE_COLORS)) {
    const id = `construction-icon-${subtype}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(Construction as IconNode, color, stroke));
  }

  // Air quality: Wind × 6 AQI level colors
  for (const [level, color] of Object.entries(AQI_LEVEL_COLORS)) {
    const id = `aq-icon-${level}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(Wind as IconNode, color, stroke));
  }

  // Water levels: Droplets × 5 state colors
  for (const [state, color] of Object.entries(WATER_STATE_COLORS)) {
    const id = `wl-icon-${state}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(Droplets as IconNode, color, stroke));
  }
}
