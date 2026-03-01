/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createApp } from './app.js';

const { app } = createApp();
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
