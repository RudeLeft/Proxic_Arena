# database/

**Migrations do not live here.** They live at:

```text
server/src/main/resources/db/migration/
```

Flyway loads them from the classpath (`classpath:db/migration`), so a
`.sql` file placed in this directory is never executed — and nothing
reports an error, because as far as Flyway is concerned it does not
exist. A migration that silently does not run is worse than one that
fails.

This directory is kept because the Phase 1 repository layout names
it, and because an empty `database/migrations/` with no explanation
is exactly the trap described above.

If you are adding a migration:

1. Create it in `server/src/main/resources/db/migration/`.
2. Name it `V00N__short_description.sql`, continuing the sequence.
3. Never edit a migration that has already been applied anywhere —
   Flyway records a checksum and will refuse the next run. Add a new
   one instead.
4. The phase that owns the tables owns the migration (PHASE_01
   §1.36: no speculative schema before its phase).
