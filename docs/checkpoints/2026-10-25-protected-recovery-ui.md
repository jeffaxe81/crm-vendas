# Protected recovery administration UI

Restore and operational deletion remain unavailable until the server reports both enabled and configured. The existing Superuser administration boundary remains responsible for access. The UI uses capability-provided confirmation phrases, requires the current password, checks preview age and compatibility, and prevents duplicate requests. Deletion first requires a separate manual preview and warns that commercial records are included.

Credentials remain only in component memory and are cleared at submission, failure, preview replacement, and session replacement. Requests from an unmounted session cannot populate the next session. Successful execution retains the receipt and preventive backup reference, stops further recovery requests, and directs the user to sign in again because execution revokes sessions.

Validation: 22 tests passed across recovery execution, backup administration, and translation catalogs; web TypeScript check passed. Real destructive execution is reserved for the backend homologation environment. No external domain is configured by this change.
