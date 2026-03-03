/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('server');

process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection — exiting', reason);
  process.exit(1);
});

try {
  const { app, scheduler } = await createApp();
  const port = Number(process.env.PORT) || 3001;

  const server = app.listen(port, () => {
    log.info(`listening on port ${port}`);
  });

  function shutdown(signal: string) {
    log.info(`${signal} received — shutting down`);
    scheduler.stop();
    server.close(() => {
      log.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      log.warn('forced exit after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} catch (err) {
  log.error('startup failed', err);
  process.exit(1);
}
