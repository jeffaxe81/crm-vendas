# Opt-in encrypted backup quotas

Administrators configure the current tenant with `PUT /admin/storage/allocation`:

```json
{ "allocatedGiB": 10, "enforced": true, "confirmation": "AJUSTAR COTA" }
```

Existing allocations remain advisory after migration. Omitting `enforced` preserves the current setting; clearing `allocatedGiB` disables enforcement. An explicit `enforced: true` requires an allocation. Activation or lowering the allocation may leave current usage above capacity: existing backups are preserved and subsequent new publications are rejected with the permanent worker error `BACKUP_QUOTA_EXCEEDED`.

`GET /admin/storage/allocation` reports `usedBytes` as total physical encrypted catalog bytes plus outstanding reservations, and `reservedBytes` as the outstanding reservation component. Catalog usage includes `COMPLETED` and `DELETING` objects, charging the plaintext snapshot length plus the 36-byte encryption envelope. `backupCount` counts those catalog rows only. PostgreSQL files, other attachments and unidentified legacy orphan files are outside this accounting.

The SQL-only reservation table has forced tenant RLS and is excluded from CRM snapshots. Capacity configuration and reservation transactions use the same tenant storage advisory lock, acquired after the shared maintenance lock and before operation/catalog row locks. A durable reservation commits before immutable publication. Same-ID retries retain the larger reservation until completion; successful authenticated adoption and catalog completion transfer the charge atomically. A discovered legacy object is charged before snapshot validation, including objects whose snapshot later fails validation.

A failed or uncertain publication retains its reservation. Reservations never expire by age. Retry the same backup ID to validate/adopt a published object and complete its catalog transaction. Do not manually remove reservations while a publisher or filesystem outcome is uncertain. Deletion/retention release capacity only after successful object removal; quota pressure never automatically deletes a backup. Existing last-valid-copy and restore-reference protections remain in force.

Restore and destructive-operation executors must durably call `reserveBackupStorage` before their preventive immutable publication, and complete the catalog plus `releaseBackupStorage` in the same transaction. Holding only an uncommitted reservation inside a transaction that may roll back cannot protect a published orphan. The recovery feature integrates this prerequisite separately.
