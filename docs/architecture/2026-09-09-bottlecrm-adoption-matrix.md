# BottleCRM Adoption Matrix — C3.0 Baseline

This matrix is the controlled intake for BottleCRM concepts into Axesistemas CRM. C3.1 must validate each preliminary classification against BottleCRM source and the current Axesistemas implementation before any replacement decision.

| Capability                    | Axesistemas baseline                                      | Preliminary class    | C3.1 evaluation                                                                      |
| ----------------------------- | --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| Organizations / tenants       | Implemented with organization-scoped application services | ADAPT                | Compare tenant context, lifecycle and isolation model                                |
| PostgreSQL RLS                | Not yet the authoritative isolation layer                 | ADAPT                | Evaluate defense-in-depth with application scoping                                   |
| Identity / authentication     | Homologated in Cycle 1                                    | KEEP_AXES            | Compare only for security gaps and compatibility                                     |
| RBAC / memberships            | Homologated fixed roles and explicit permissions          | ADAPT                | Compare team/role model without weakening current permissions                        |
| Accounts / companies          | Implemented in Cycle 2                                    | ADAPT                | Map fields, lifecycle, search and soft delete semantics                              |
| Contacts                      | Implemented independently of companies                    | ADAPT                | Preserve independent contacts and organization isolation                             |
| Contact channels              | Implemented in Cycle 2                                    | KEEP_AXES            | Verify whether BottleCRM adds reusable value                                         |
| Company-contact relationships | Implemented in Cycle 2                                    | KEEP_AXES            | Preserve explicit link/unlink behavior and validation                                |
| Relationship history          | Implemented in Cycle 2                                    | ADAPT                | Compare activity/history models                                                      |
| Tags                          | Implemented organization-scoped                           | ADAPT                | Compare tagging semantics and extensibility                                          |
| Custom fields                 | Implemented for company/contact scopes                    | ADAPT                | Compare extensibility and validation                                                 |
| Leads                         | Not part of Cycle 2 core                                  | ADOPT candidate      | Evaluate domain fit before implementation                                            |
| Opportunities / pipeline      | Planned CRM MVP capability                                | ADOPT candidate      | Evaluate stages, ownership and sales workflow                                        |
| Tasks / activities            | Planned evolution                                         | ADOPT candidate      | Evaluate activity model and relation to history                                      |
| Cases / tickets               | Future/vertical concern                                   | IGNORE candidate     | Keep outside core unless backlog justifies it                                        |
| Attachments                   | Not authoritative in current core                         | ADOPT candidate      | Evaluate storage, permissions, audit and malware controls                            |
| Audit trail                   | Append-only audit exists                                  | ADAPT                | Compare coverage while preserving security guarantees                                |
| Async jobs                    | Not selected as BottleCRM dependency                      | ADAPT                | Evaluate only for concrete workloads                                                 |
| API contracts                 | REST/contracts exist in Axesistemas                       | KEEP_AXES            | BottleCRM implementation may adapt behind Axes contracts                             |
| AI / MCP / RAG foundations    | Planned ecosystem capability                              | ADAPT                | Adopt only with explicit boundaries, permissions and audit                           |
| BottleCRM UI                  | Axesistemas Wireframe A is approved                       | IGNORE as product UI | Reuse concepts only; Axesistemas UX remains authoritative                            |
| Axesistemas integrations      | Product differentiator                                    | KEEP_AXES            | PABX, NEO, UNA, Asterisk, Intelbras, WhatsApp, e-mail and connectors stay Axes-owned |

## Rules

A preliminary classification is not permission to copy or replace code. C3.1 must attach evidence, dependency impact, license/provenance notes, compatibility risks, migration impact and test requirements to every capability selected for ADOPT, ADAPT or REPLACE.

`REPLACE` is intentionally absent from the baseline matrix. Replacement may only be proposed after the gap analysis demonstrates a measurable benefit and defines regression/migration coverage.
