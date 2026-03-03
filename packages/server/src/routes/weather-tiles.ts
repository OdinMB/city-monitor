/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('route:weather-tiles');

const OWM_LAYER = 'clouds_new';

export function createWeatherTilesRouter() {
  const router = Router();

  router.get('/weather-tiles/:z/:x/:y.png', async (req, res) => {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ error: 'Weather tiles not configured' });
      return;
    }

    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    const maxCoord = Math.pow(2, z);

    if (
      !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) ||
      z < 0 || z > 19 || x < 0 || y < 0 ||
      x >= maxCoord || y >= maxCoord
    ) {
      res.status(400).json({ error: 'Invalid tile coordinates' });
      return;
    }

    const url = `https://tile.openweathermap.org/map/${OWM_LAYER}/${z}/${x}/${y}.png?appid=${apiKey}`;

    try {
      const upstream = await fetch(url);
      if (!upstream.ok) {
        if (upstream.status === 401) {
          log.error('OWM API key is invalid — check OPENWEATHERMAP_API_KEY');
          res.status(503).json({ error: 'Weather tiles not configured' });
        } else {
          log.error(`OWM tile ${z}/${x}/${y} returned ${upstream.status}`);
          res.status(502).json({ error: 'Upstream tile fetch failed' });
        }
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=600');
      res.send(buffer);
    } catch (err) {
      log.error(`OWM tile ${z}/${x}/${y} fetch error`, err);
      res.status(502).json({ error: 'Upstream tile fetch failed' });
    }
  });

  return router;
}
