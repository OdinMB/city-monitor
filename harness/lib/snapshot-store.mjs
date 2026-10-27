/**
 * One city's snapshot rows in the run's own Postgres, read and changed
 * through the product's Drizzle schema on a connection the product's
 * openLocalDatabase checked (lib/product-child.mjs opens it). Every statement
 * names the snapshots table, the city and the snapshot type; nothing else is
 * touched. The caller passes drizzle-orm's operators in, so this module
 * imports nothing and its statements can be built without a database.
 */

/**
 * `db` is a Drizzle database, `orm` holds `table` (the snapshots table) and
 * drizzle-orm's `and`, `desc`, `eq` and `inArray`. Rows come back as
 * { id, fetchedAt (ms), data }, newest first, as lib/scenarios.mjs expects.
 */
export function snapshotStore(db, { table, and, desc, eq, inArray }, cityId) {
  const where = (type, ...more) => and(eq(table.cityId, cityId), eq(table.type, type), ...more);

  const readQuery = (type) => db
    .select({ id: table.id, data: table.data, fetchedAt: table.fetchedAt })
    .from(table)
    .where(where(type))
    .orderBy(desc(table.fetchedAt), desc(table.id));

  /** The statements for `changes` (lib/scenarios.mjs), built on `q` (the database or a transaction): deletes, updates, inserts. */
  function writeQueries(q, { deletes, updates, inserts }) {
    const queries = [];
    const idsByType = new Map();
    for (const { type, id } of deletes) idsByType.set(type, [...(idsByType.get(type) ?? []), id]);
    for (const [type, ids] of idsByType) queries.push(q.delete(table).where(where(type, inArray(table.id, ids))));
    for (const { type, id, data, fetchedAt } of updates) {
      const set = {};
      if (data !== undefined) set.data = data;
      if (fetchedAt !== undefined) set.fetchedAt = new Date(fetchedAt);
      queries.push(q.update(table).set(set).where(where(type, eq(table.id, id))));
    }
    for (const { type, data, fetchedAt } of inserts) {
      queries.push(q.insert(table).values({ cityId, type, data, fetchedAt: new Date(fetchedAt) }));
    }
    return queries;
  }

  return {
    readQuery,
    writeQueries,
    async rows(type) {
      const rows = await readQuery(type);
      return rows.map((row) => ({ id: row.id, data: row.data, fetchedAt: row.fetchedAt.getTime() }));
    },
    /** Writes every change in one transaction, so a failed scenario leaves the seed as it was. */
    async write(changes) {
      await db.transaction(async (tx) => {
        for (const query of writeQueries(tx, changes)) await query;
      });
    },
  };
}
