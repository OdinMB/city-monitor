import net from 'node:net';
import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('server');

// Node tries a host's addresses in turn (happy eyeballs) and gives each one
// 250 ms before abandoning it for the next. When a burst of jobs keeps the
// event loop busy, a working connect is dropped that way; when the next
// address is one the server cannot reach (an IPv6 one, likely), fetch throws
// within a second. The logs of 2026-11-04 show that pattern: two or four
// failed attempts in 0.5 to 1.7 s against hosts that answer fine. 2.5 s lets
// a slow connect finish.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_500);

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
