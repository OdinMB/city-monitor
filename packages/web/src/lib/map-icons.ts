/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Lucide-to-canvas icon renderer for MapLibre GL map markers.
 * Draws crisp SVG-based icons onto ImageData via Path2D (synchronous).
 */

import { TrainFront, Newspaper, ShieldAlert, Pill } from 'lucide';
import type maplibregl from 'maplibre-gl';

type IconNode = [tag: string, attrs: Record<string, string | number>][];

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
}
