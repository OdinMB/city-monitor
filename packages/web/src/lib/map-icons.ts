/**
 * Lucide-to-canvas icon renderer for MapLibre GL map markers.
 * Draws crisp SVG-based icons onto ImageData via Path2D (synchronous).
 */

import { TrainFront, Newspaper, ShieldAlert, Pill, HeartPulse, Construction, Waves, Landmark, Building2, Building, MapPin, Palette, Trophy, TrendingUp, Siren } from 'lucide';
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

export const NEWS_CATEGORY_ICONS: Record<string, IconNode> = {
  local: MapPin as IconNode,
  politics: Landmark as IconNode,
  transit: TrainFront as IconNode,
  culture: Palette as IconNode,
  crime: ShieldAlert as IconNode,
  weather: Newspaper as IconNode,
  economy: TrendingUp as IconNode,
  sports: Trophy as IconNode,
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

export const BATHING_QUALITY_COLORS: Record<string, string> = {
  good: '#22c55e',
  warning: '#f59e0b',
  poor: '#ef4444',
};

export const NOISE_LEVEL_COLORS: Record<string, string> = {
  quiet: '#22c55e',
  moderate: '#eab308',
  loud: '#f97316',
  veryLoud: '#ef4444',
};

export const POLITICAL_ICONS: Record<string, IconNode> = {
  bezirke: Landmark as IconNode,
  bundestag: Building2 as IconNode,
  landesparlament: Building as IconNode,
};

const ICON_SIZE = 36;
const VERTICAL_BADGE_MAX_TEXT_WIDTH = 100;
const VERTICAL_BADGE_MAX_LINES = 3;

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

/**
 * Draw a wide pill badge: Lucide icon on the left + text label on the right.
 * Each unique (value, color) combination gets its own image.
 */
export function createBadgeIcon(
  iconNode: IconNode,
  bgColor: string,
  strokeColor: string,
  text: string,
): ImageData {
  const h = 32;
  const iconArea = 28;
  const textPad = 6;

  // Measure text width
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = 'bold 13px sans-serif';
  const textW = Math.ceil(measure.measureText(text).width);

  const w = iconArea + textPad + textW + 8; // 8 = right padding
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Pill background
  const pad = 1;
  const r = 8;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Lucide icon on the left (24×24 viewbox scaled to fit iconArea)
  const iconSize = iconArea * 0.6;
  const scale = iconSize / 24;
  const iconOffsetX = (iconArea - iconSize) / 2;
  const iconOffsetY = (h - iconSize) / 2;

  ctx.save();
  ctx.translate(iconOffsetX, iconOffsetY);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [tag, attrs] of iconNode) {
    drawSVGElement(ctx, tag, attrs);
  }
  ctx.restore();

  // Text on the right
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, iconArea + textPad - 2, h / 2 + 1);

  return ctx.getImageData(0, 0, w, h);
}

/**
 * Word-wrap text into lines that fit within maxWidth pixels.
 * Pure function once given a measuring context.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = currentLine + ' ' + words[i];
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
      if (lines.length >= maxLines - 1) {
        // Last allowed line — append remaining words and truncate
        const remaining = [currentLine, ...words.slice(i + 1)].join(' ');
        if (ctx.measureText(remaining).width > maxWidth) {
          // Truncate with ellipsis
          let truncated = remaining;
          while (ctx.measureText(truncated + '…').width > maxWidth && truncated.length > 1) {
            truncated = truncated.slice(0, -1);
          }
          lines.push(truncated + '…');
        } else {
          lines.push(remaining);
        }
        return lines;
      }
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Draw a vertical badge: Lucide icon on top + text label below (with word-wrap).
 * The icon portion is anchored at the geolocation; text extends below.
 */
export function createVerticalBadgeIcon(
  iconNode: IconNode,
  bgColor: string,
  strokeColor: string,
  text: string,
  maxTextWidth = VERTICAL_BADGE_MAX_TEXT_WIDTH,
): ImageData {
  const iconSize = 32;
  const iconPad = 3;
  const textFontSize = 11;
  const lineHeight = 14;
  const textPadY = 4;
  const textPadX = 6;
  // Measure text + wrap
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `bold ${textFontSize}px sans-serif`;
  const lines = wrapText(measure, text, maxTextWidth, VERTICAL_BADGE_MAX_LINES);
  const lineWidths = lines.map((l) => Math.ceil(measure.measureText(l).width));
  const maxLineW = Math.max(...lineWidths, 0);

  const textBlockW = Math.max(maxLineW + textPadX * 2, iconSize + iconPad * 2);
  const textBlockH = lines.length * lineHeight + textPadY * 2;
  const iconBgSize = iconSize + iconPad * 2;

  const w = Math.max(iconBgSize, textBlockW);
  const h = iconBgSize + textBlockH;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const r = 6;

  // --- Icon portion: fixed-width, centered horizontally ---
  const iconBoxX = (w - iconBgSize) / 2;
  ctx.beginPath();
  ctx.roundRect(iconBoxX, 0, iconBgSize, iconBgSize, [r, r, 0, 0]);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- Text portion: at least as wide as icon, centered horizontally ---
  const textBoxX = (w - textBlockW) / 2;
  ctx.beginPath();
  ctx.roundRect(textBoxX, iconBgSize, textBlockW, textBlockH, [0, 0, r, r]);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- Fill the seam between icon and text boxes ---
  const seamX = Math.min(iconBoxX, textBoxX);
  const seamW = Math.max(iconBgSize, textBlockW);
  ctx.fillStyle = bgColor;
  ctx.fillRect(seamX + 1, iconBgSize - 1, seamW - 2, 3);

  // --- Divider line between icon and text areas ---
  const textY = iconBgSize;
  const dividerLeft = Math.max(iconBoxX, textBoxX) + 4;
  const dividerRight = Math.min(iconBoxX + iconBgSize, textBoxX + textBlockW) - 4;
  if (dividerRight > dividerLeft) {
    ctx.beginPath();
    ctx.moveTo(dividerLeft, textY);
    ctx.lineTo(dividerRight, textY);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- Lucide icon (centered in icon background) ---
  const lucideSize = iconSize * 0.55;
  const scale = lucideSize / 24;
  const lucideOffsetX = iconBoxX + (iconBgSize - lucideSize) / 2;
  const lucideOffsetY = (iconBgSize - lucideSize) / 2;

  ctx.save();
  ctx.translate(lucideOffsetX, lucideOffsetY);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [tag, attrs] of iconNode) {
    drawSVGElement(ctx, tag, attrs);
  }
  ctx.restore();

  // --- Text lines (white on colored background) ---
  ctx.font = `bold ${textFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  const textStartY = textY + textPadY;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], w / 2, textStartY + i * lineHeight);
  }

  return ctx.getImageData(0, 0, w, h);
}

/** Register all Lucide-based map icons for every data layer */
export function registerAllMapIcons(map: maplibregl.Map, isDark: boolean) {
  const stroke = isDark ? '#1f2937' : '#ffffff';

  // News: distinct icon per category × category colors
  for (const [category, color] of Object.entries(NEWS_CATEGORY_COLORS)) {
    const id = `news-icon-${category}`;
    if (map.hasImage(id)) map.removeImage(id);
    const icon = NEWS_CATEGORY_ICONS[category] ?? (Newspaper as IconNode);
    map.addImage(id, createMapIcon(icon, color, stroke));
  }

  // Police reports: Siren, orange
  const safetyId = 'safety-icon';
  if (map.hasImage(safetyId)) map.removeImage(safetyId);
  map.addImage(safetyId, createMapIcon(Siren as IconNode, '#f97316', stroke));

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

  // Bathing water: Waves × 3 quality colors
  for (const [quality, color] of Object.entries(BATHING_QUALITY_COLORS)) {
    const id = `bathing-icon-${quality}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(Waves as IconNode, color, stroke));
  }

}

/**
 * Register political marker icons for the given sub-layer and party colors.
 * Creates one image per unique party color: `political-icon-{color}`.
 */
export function registerPoliticalIcons(
  map: maplibregl.Map,
  subLayer: 'bezirke' | 'bundestag' | 'landesparlament',
  partyColors: string[],
  isDark: boolean,
) {
  const stroke = isDark ? '#1f2937' : '#ffffff';
  const iconNode = POLITICAL_ICONS[subLayer];
  for (const color of partyColors) {
    const id = `political-icon-${color.replace('#', '')}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createMapIcon(iconNode, color, stroke));
  }
}
