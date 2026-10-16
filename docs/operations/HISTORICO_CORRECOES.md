# Histórico de correções — CRM-Vendas

Inventário dos commits cujo título começa com `fix:` ou `fix(`, alcançáveis na main de referência `fb4ec4ecf3acdcc4f9b255811c254a613b5b9ed3`, revisado em 16/10/2026. Inclui correções de produto, configuração, segurança e testes/CI. Não é lista de incidentes de produção: títulos são evidência de alteração, não de reprodução ou implantação. Commits distintos com título igual foram preservados para rastreabilidade. Defeitos descritos em commits com outro prefixo podem estar nos checkpoints e nas fichas do [manual](MANUAL_INTERNO_PROBLEMAS.md).

Correção CORS posterior à referência: [PR #219](https://github.com/jeffaxe81/crm-vendas/pull/219), commit [7a72c112](https://github.com/jeffaxe81/crm-vendas/commit/7a72c112e202522860d11a65663999044ee24364); proposta, sem implantação comprovada.

Total de commits de correção inventariados na referência: **152**.

| Data do commit | Evidência | Título original |
| --- | --- | --- |
| 2026-10-16 | [c8a6b574](https://github.com/jeffaxe81/crm-vendas/commit/c8a6b574b817abf29091aa1ce56c208d4fff7f9e) | fix: show the company identifier used for login |
| 2026-10-16 | [e4683d0b](https://github.com/jeffaxe81/crm-vendas/commit/e4683d0b2d97070b135fe04cd5e68245cba2be19) | fix: allow the same account in multiple organizations |
| 2026-10-15 | [fc353453](https://github.com/jeffaxe81/crm-vendas/commit/fc3534531587788e7f06f3055911eb626e2ae7d3) | fix(backup): accept valid UUIDs in download and preview administration |
| 2026-10-15 | [8a0f65bd](https://github.com/jeffaxe81/crm-vendas/commit/8a0f65bd38249548bb5be8f8181ca60d1249da7d) | fix(backup): revalidate queued deletion guards and retain polling after refresh errors |
| 2026-10-15 | [cee7e16d](https://github.com/jeffaxe81/crm-vendas/commit/cee7e16d78d37313a1ef616303623778b236f382) | fix(backup): terminalize invalid snapshot references |
| 2026-10-15 | [dd8e2ceb](https://github.com/jeffaxe81/crm-vendas/commit/dd8e2ceb051294c59cc58c45931141bb53846d39) | fix(backup): release queue on permanent snapshot failure |
| 2026-10-15 | [3f874059](https://github.com/jeffaxe81/crm-vendas/commit/3f874059fd1d05d2ed3f2152014e4fd344d5aace) | fix(backup): reconcile immutable snapshots and stop stale workers |
| 2026-10-15 | [62846b03](https://github.com/jeffaxe81/crm-vendas/commit/62846b03a35607192d6078cc94d1ed5d838b7c5d) | fix(backup): renew worker lease while snapshot and file I/O run |
| 2026-10-15 | [45a7a371](https://github.com/jeffaxe81/crm-vendas/commit/45a7a371b1e759fd8e78beb71ccfe39cf97d8010) | fix(backup): fence terminal catalog updates and avoid stale worker object deletion |
| 2026-10-15 | [b6b499a5](https://github.com/jeffaxe81/crm-vendas/commit/b6b499a5e7b135c10648a20693d778cb953b8bc6) | fix: take maintenance snapshots after prior writers commit (#208) |
| 2026-10-15 | [645b050c](https://github.com/jeffaxe81/crm-vendas/commit/645b050c6913fef87e4ad3ff07a7844864de9f46) | fix(quick-setup): preserve concurrent progress and completion (#209) |
| 2026-10-15 | [4488fd4c](https://github.com/jeffaxe81/crm-vendas/commit/4488fd4cd548b6724e026ca06ed0ea57851e56d6) | fix(backup): reject lease lost before writing backup file (#207) |
| 2026-10-15 | [350be3a5](https://github.com/jeffaxe81/crm-vendas/commit/350be3a559748cfc7c2301d4beaee0c70b287341) | fix(backup): pass claimed worker attempt to recovery service (#207) |
| 2026-10-15 | [a6fe4118](https://github.com/jeffaxe81/crm-vendas/commit/a6fe4118d8109e9461b9285a5eaa8b6bea5619b6) | fix(backup): reconcile interrupted catalogs for leased worker (#207) |
| 2026-10-14 | [0051b319](https://github.com/jeffaxe81/crm-vendas/commit/0051b3194d6a008744c6e284bda6d86e68f2c8db) | fix(restore): keep RED test valid and formatted |
| 2026-10-13 | [63a51ffe](https://github.com/jeffaxe81/crm-vendas/commit/63a51ffe4a74773b4f6d5d7685560bd66751c695) | fix(deploy): require explicit admin bootstrap on Linux upgrades (#198) |
| 2026-10-13 | [dcf91aa3](https://github.com/jeffaxe81/crm-vendas/commit/dcf91aa3fd056314b4bdad5334507fa95121e08b) | fix(api): tenant-scoped bootstrap audit logging (#196) |
| 2026-10-13 | [4fa9d118](https://github.com/jeffaxe81/crm-vendas/commit/4fa9d118b0d75e4aaf4cc295031918304849f994) | fix(release): reject cross-host and path-scoped HTTPS smoke checks |
| 2026-10-12 | [df623c66](https://github.com/jeffaxe81/crm-vendas/commit/df623c66f53f1f3cfce5bcdcb4013afa01f94970) | fix(release): require explicit SHA and distinct acceptance evidence (#188) |
| 2026-10-12 | [2f225b97](https://github.com/jeffaxe81/crm-vendas/commit/2f225b974f5b305c8b931d35485c768000102b1f) | fix(release): reject empty Next.js static bundle in deployment diagnostic |
| 2026-10-12 | [73fac67a](https://github.com/jeffaxe81/crm-vendas/commit/73fac67a0e83ff8435bff87d80cfdbea8ca66d86) | fix(release): refuse false positive when bundle scan fails |
| 2026-10-12 | [f54877e8](https://github.com/jeffaxe81/crm-vendas/commit/f54877e8171eff39ffa36fe1b852693178059220) | fix(release): fail closed when web bundle cannot be inspected |
| 2026-10-12 | [85a22204](https://github.com/jeffaxe81/crm-vendas/commit/85a222042faa49002ebead9ac9c06101489be455) | fix(release): ignore .curlrc for fail-closed TLS and HTTP diagnostics |
| 2026-10-12 | [505a08ae](https://github.com/jeffaxe81/crm-vendas/commit/505a08aeeed653d86e1f9ffd1fb6358f57c01739) | fix(release): ignore .curlrc for fail-closed TLS and HTTP diagnostics |
| 2026-10-12 | [0ecbb302](https://github.com/jeffaxe81/crm-vendas/commit/0ecbb302cf0679c041b1ecf44fe57b37ed369fcc) | fix(release): reject inconsistent redirect status on second HTTP HEAD |
| 2026-10-11 | [afcd90b9](https://github.com/jeffaxe81/crm-vendas/commit/afcd90b97b758d4b7ce14adfc1889badc07a437a) | fix(release): fail closed for local curl transfer errors as well |
| 2026-10-11 | [ab4324de](https://github.com/jeffaxe81/crm-vendas/commit/ab4324de564c8c976433468fea3af5ec1e275ca5) | fix(release): require successful curl exit in on-host TLS diagnostics |
| 2026-10-11 | [0944c142](https://github.com/jeffaxe81/crm-vendas/commit/0944c1429ed079e3e1a8d86f2ec61753aa800810) | fix(release): reject partial curl responses and ambiguous HTTPS redirects |
| 2026-10-11 | [7fecdd9d](https://github.com/jeffaxe81/crm-vendas/commit/7fecdd9d86e9579156627dad8ea160318b232102) | fix(test): correct regular-expression escaping for provenance job assertions |
| 2026-10-11 | [85d51c32](https://github.com/jeffaxe81/crm-vendas/commit/85d51c328283985d96db376197576ed38a666244) | fix(ci): generate source provenance after verify from a clean isolated checkout |
| 2026-10-11 | [c3c452f6](https://github.com/jeffaxe81/crm-vendas/commit/c3c452f6b41a6effcc935483eda5c1843cc6ee61) | fix(oauth): enforce provider revision through encrypted credential vault |
| 2026-10-11 | [50c13bce](https://github.com/jeffaxe81/crm-vendas/commit/50c13bce4a03960e5bc4e4985204599ff81557fd) | fix(oauth): enforce provider revision through encrypted credential vault |
| 2026-10-11 | [59e2c219](https://github.com/jeffaxe81/crm-vendas/commit/59e2c2191be683e1ecb9c6bd12d187c1b097a6e7) | fix(oauth): enforce provider revision through encrypted credential vault |
| 2026-10-11 | [cb4dd723](https://github.com/jeffaxe81/crm-vendas/commit/cb4dd723a9293a53f7500cd68911c646c9520688) | fix(oauth): enforce provider revision through encrypted credential vault |
| 2026-10-11 | [9fe31fe5](https://github.com/jeffaxe81/crm-vendas/commit/9fe31fe547e05338eebdadac2a5022ab6e5aa152) | fix(oauth): enforce provider revision through encrypted credential vault |
| 2026-10-11 | [bc7f2049](https://github.com/jeffaxe81/crm-vendas/commit/bc7f2049649b7961d2817d1537ea4c7066e7d097) | fix(oauth): enforce provider revision through encrypted credential vault |
| 2026-10-11 | [e5f4fd61](https://github.com/jeffaxe81/crm-vendas/commit/e5f4fd615f8e65f448d560a663aad72aa2b8f3ca) | fix(oauth): reject stale provider revision at pending grant stage |
| 2026-10-11 | [00d42fe7](https://github.com/jeffaxe81/crm-vendas/commit/00d42fe7188a61879889615bd7e44101028e670b) | fix(oauth): reject stale provider revision at pending grant stage |
| 2026-10-11 | [0f90d2c6](https://github.com/jeffaxe81/crm-vendas/commit/0f90d2c684ae7a69a472d9b51b2b23679bda5a9d) | fix(oauth): reject stale provider revision at pending grant stage |
| 2026-10-11 | [176d6a91](https://github.com/jeffaxe81/crm-vendas/commit/176d6a914b4d04bcc8948de037ce2754feed8fd3) | fix(oauth): reject stale provider revision at pending grant stage |
| 2026-10-11 | [ab80b7ae](https://github.com/jeffaxe81/crm-vendas/commit/ab80b7aec68dfa360ece2866b14cf092b75526a7) | fix(release): reconcile scoped DB readiness preflight with HTTPS CA checks |
| 2026-10-11 | [7d4bb0b8](https://github.com/jeffaxe81/crm-vendas/commit/7d4bb0b8ec773b01ef2250cd00728a294edbaf5f) | fix(release): correct YAML matching regex escaping in API dependency check |
| 2026-10-11 | [735793df](https://github.com/jeffaxe81/crm-vendas/commit/735793df8fb3a82601bdf8beb57765be790186b6) | fix(release): scope startup dependency checks to API service in Compose |
| 2026-10-11 | [93c48b9e](https://github.com/jeffaxe81/crm-vendas/commit/93c48b9e4ccd1c303980c5ed69cc96791847a2d2) | fix(test): normalize regex escapes in TLS contract assertions |
| 2026-10-11 | [8de6551d](https://github.com/jeffaxe81/crm-vendas/commit/8de6551d2a7c9622fb755f2c94d97294f45e026b) | fix(release): fail closed on missing CA and authenticate every server HTTPS probe |
| 2026-10-11 | [c0697c13](https://github.com/jeffaxe81/crm-vendas/commit/c0697c1352b93b35df352b23bf2f16bcfdb8b598) | fix(test): use JavaScript whitespace classes in TLS bypass assertion |
| 2026-10-11 | [1b9a792d](https://github.com/jeffaxe81/crm-vendas/commit/1b9a792d46ce29cbaad702b9db2500f622111d6a) | fix(release): preflight rejects insecure external HTTPS smoke contracts |
| 2026-10-11 | [e0d108e3](https://github.com/jeffaxe81/crm-vendas/commit/e0d108e3840095dd58ea700e6cf151832bbcc2f0) | fix(release): fail closed without trusted CA and verify HTTPS redirect target |
| 2026-10-11 | [27f43ec7](https://github.com/jeffaxe81/crm-vendas/commit/27f43ec7a7f7fb350f36f6b81914e38d9edef831) | fix(email): accept case-insensitive sender domains before encryption |
| 2026-10-11 | [0efaa36d](https://github.com/jeffaxe81/crm-vendas/commit/0efaa36d82f00499bc505779de910364bcf77685) | fix(email): expose stable, non-sensitive OAuth configuration error code |
| 2026-10-11 | [af596988](https://github.com/jeffaxe81/crm-vendas/commit/af596988e5dd31fdf03c6f83866a82ebcccbff5d) | fix(email): reject IP-based OAuth callback hosts |
| 2026-10-10 | [5b1b7a52](https://github.com/jeffaxe81/crm-vendas/commit/5b1b7a5259f5f06a84f58fab068f2ffd63abe343) | fix(email): share strict opaque reference schema with authenticated review endpoint |
| 2026-10-10 | [ab45d1e8](https://github.com/jeffaxe81/crm-vendas/commit/ab45d1e8bd0d927ba7f0e3979fb71adb68937a63) | fix(email): require opaque reconciliation reference in audit rather than URL-shaped strings |
| 2026-10-10 | [e4709992](https://github.com/jeffaxe81/crm-vendas/commit/e4709992bac756c9d283001d6491bcac4e12d5a7) | fix(web): load email diagnostics on demand without disturbing integration credentials |
| 2026-10-10 | [5a2911c1](https://github.com/jeffaxe81/crm-vendas/commit/5a2911c1de77f696ab538ca1b1e4602af79a6233) | fix(email): narrow simulated relay idempotency header before journal access |
| 2026-10-10 | [841d1606](https://github.com/jeffaxe81/crm-vendas/commit/841d160674310ef5d833a48708c5a152a07f1197) | fix(backup): explicitly preserve and exclude relay secrets from tenant snapshots |
| 2026-10-10 | [52ffa292](https://github.com/jeffaxe81/crm-vendas/commit/52ffa292de85d46cc0e9a12e9efacf067f390fa1) | fix(email): correct DNS hostname validator regex |
| 2026-10-10 | [6edf51a0](https://github.com/jeffaxe81/crm-vendas/commit/6edf51a086a5365704ae9123e7665193ec53bd0a) | fix(email): import AuthorizationModule for manual review guards |
| 2026-10-10 | [9de73fed](https://github.com/jeffaxe81/crm-vendas/commit/9de73fede10867bf6e4275a12464b3ff243be08f) | fix(tests): type tenant fixture tuple entries as non-optional |
| 2026-10-10 | [6bb997db](https://github.com/jeffaxe81/crm-vendas/commit/6bb997db4f520ccd637228df43774b67da024da9) | fix(email): use explicit Prisma tenant transaction type |
| 2026-10-10 | [6abfd54c](https://github.com/jeffaxe81/crm-vendas/commit/6abfd54c446642b73a123a53ac9010b210cf9049) | fix(f4.3): page through SLA candidates to avoid starvation after first 100 |
| 2026-10-09 | [cc72041c](https://github.com/jeffaxe81/crm-vendas/commit/cc72041c204c0cdd7f840ef3f850f2f412406d4f) | fix(c6): preservar alerta de conflito após atualização automática de versão |
| 2026-10-09 | [0464e168](https://github.com/jeffaxe81/crm-vendas/commit/0464e168bf326ac3698846e86dc00fb12a2d6afe) | fix(c6): isolar relatórios por organização e estabilizar CI |
| 2026-10-09 | [9e2a6e17](https://github.com/jeffaxe81/crm-vendas/commit/9e2a6e1764b994d85f6a68289d4aa6efe4f63198) | fix(c12): homologação e correções de regressão pós-merge (#109) |
| 2026-10-09 | [373a801a](https://github.com/jeffaxe81/crm-vendas/commit/373a801aee6a846e078b0957b22d2694b47c0b36) | fix(deploy): Ciclo 12 HTTPS reproduzível e correção do 502 (#107) |
| 2026-10-09 | [ba08da44](https://github.com/jeffaxe81/crm-vendas/commit/ba08da44045a37e257471d0d7e86f535e3009b86) | fix(webhooks): coordinate request start and preserve cancelled attempt results |
| 2026-10-08 | [fda06e48](https://github.com/jeffaxe81/crm-vendas/commit/fda06e48622cef5ada7634fceb89bf16ffde9509) | fix(compose): run migrations before API startup (#104) |
| 2026-10-07 | [c4c2edd3](https://github.com/jeffaxe81/crm-vendas/commit/c4c2edd31a4cb5c6bf8d3985ce58329622fefca6) | fix(web): document companyDocument in contact CSV import |
| 2026-10-07 | [bb9316cf](https://github.com/jeffaxe81/crm-vendas/commit/bb9316cfd720b3819577a6f6b6d5ade927a26e49) | fix(web): hide stale CSAT link during refresh |
| 2026-10-07 | [64903eb1](https://github.com/jeffaxe81/crm-vendas/commit/64903eb1cfe3ecddbffcafad60b2d9d901ce5451) | fix(c5): distinguish load failures from clipboard/action errors |
| 2026-10-07 | [7a02a3cf](https://github.com/jeffaxe81/crm-vendas/commit/7a02a3cff2df771aaee291d404e67992808c2257) | fix(c5): refresh CSAT state and permit retry after request errors |
| 2026-10-07 | [f7eca3a0](https://github.com/jeffaxe81/crm-vendas/commit/f7eca3a0a879bddae3865f6076bdc881051eee51) | fix(web): recover pagination after deleting the last record on a page |
| 2026-10-07 | [f8bb96e7](https://github.com/jeffaxe81/crm-vendas/commit/f8bb96e77782615919a92ffe546d512d40b39b06) | fix(c4): validar vendedores e expor nomes em territórios |
| 2026-10-07 | [3e8f7a52](https://github.com/jeffaxe81/crm-vendas/commit/3e8f7a52ce825764d079d4669cfe764020932735) | fix(web): tratar kind opcional nas etapas do Kanban |
| 2026-10-07 | [95357eaf](https://github.com/jeffaxe81/crm-vendas/commit/95357eaf72a941ef7d6e9f40ea6b3f523d3e9345) | fix(web): tolerar etapas legadas sem kind |
| 2026-10-07 | [7663c5fe](https://github.com/jeffaxe81/crm-vendas/commit/7663c5fe4aff3b53473a711e03f3a8fd4a335220) | fix(api): impedir reabertura de oportunidades encerradas |
| 2026-10-07 | [6d37fbd1](https://github.com/jeffaxe81/crm-vendas/commit/6d37fbd166cff3034a38b90178feeec33c78cc53) | fix(web): style sales funnel columns and cards with contained mobile scrolling |
| 2026-10-06 | [f2f1f7b0](https://github.com/jeffaxe81/crm-vendas/commit/f2f1f7b063dc8cfe377182cddd32129e8a0e913d) | fix: restore foundation gate and format restore preview |
| 2026-10-06 | [5c5a8945](https://github.com/jeffaxe81/crm-vendas/commit/5c5a8945698bfe9e9fd1f6e53f36bb684af9e3c8) | fix: scope maintenance bypass to current tenant |
| 2026-10-06 | [f0a14434](https://github.com/jeffaxe81/crm-vendas/commit/f0a14434bfa6a6efae083d3f6246a691b7a95fe9) | fix: retry failed backup operation idempotently |
| 2026-10-06 | [a8df1793](https://github.com/jeffaxe81/crm-vendas/commit/a8df17930e52863489bbcd55b7c57131fbe209aa) | fix: wire backup worker into Nest lifecycle |
| 2026-10-06 | [fded1d20](https://github.com/jeffaxe81/crm-vendas/commit/fded1d2012f2fef171158abea7cc50d35961f0c1) | fix: make backup schedule service injectable |
| 2026-10-05 | [23ec77b7](https://github.com/jeffaxe81/crm-vendas/commit/23ec77b734c3bfd41e96776aadcdbc023d76f14d) | fix: inject backup database explicitly in tsx startup |
| 2026-10-05 | [87e1cc39](https://github.com/jeffaxe81/crm-vendas/commit/87e1cc396ea3c9bb586e2c900aed18a0ce615315) | fix: reject backup scalar values outside database native bounds |
| 2026-10-05 | [9652b0dd](https://github.com/jeffaxe81/crm-vendas/commit/9652b0ddf2cc11000fda47306f427edd62890847) | fix: reject shared backup directories without changing permissions |
| 2026-10-04 | [75ea94d3](https://github.com/jeffaxe81/crm-vendas/commit/75ea94d392c2048ee8c9c14a73ffdb1232e9cb51) | fix: preserve precise database event chronology |
| 2026-10-04 | [278a9d1e](https://github.com/jeffaxe81/crm-vendas/commit/278a9d1e88f6dee7d2bfc0575ac9e88cfc079d21) | fix: order ticket creation before same-timestamp assignment |
| 2026-10-04 | [00e38f97](https://github.com/jeffaxe81/crm-vendas/commit/00e38f9763dc2d369591e7af9df164290ade7b42) | fix(e2e): align session assertions with CRM-F004 shell |
| 2026-10-04 | [0a6b5772](https://github.com/jeffaxe81/crm-vendas/commit/0a6b5772b2357acc92288dd99f60bd469754a8ec) | fix(e2e): navigate to companies after workspace restore |
| 2026-10-04 | [8609389f](https://github.com/jeffaxe81/crm-vendas/commit/8609389fa5a8abd55f4857f975dc8b3f98cb0d0e) | fix(test): align workspace login expectations with auth contract |
| 2026-10-03 | [4294360b](https://github.com/jeffaxe81/crm-vendas/commit/4294360b1140a7d707d58be7b02e9ec6602f0f55) | fix(docker): add Windows PostgreSQL initialization recovery script |
| 2026-10-03 | [53368645](https://github.com/jeffaxe81/crm-vendas/commit/53368645c401594459aea89733491b0302ab81f4) | fix(docker): preserve LF endings for shell scripts on Windows |
| 2026-09-27 | [56060c97](https://github.com/jeffaxe81/crm-vendas/commit/56060c972c6de96fede8af3d4e27e51480e27dff) | fix(webhooks): satisfy strict IP validation typing |
| 2026-09-27 | [65f56309](https://github.com/jeffaxe81/crm-vendas/commit/65f563091c9674b9239e9659750b511640406322) | fix(test): corrigir teste de perda de escopo por democao de papel |
| 2026-09-26 | [c6e2ab72](https://github.com/jeffaxe81/crm-vendas/commit/c6e2ab7267813d055692dbf67e3b84db1d300125) | fix(test): sales-by-month espera 403 para VIEWER e 200 para ADMIN |
| 2026-09-26 | [413f5be3](https://github.com/jeffaxe81/crm-vendas/commit/413f5be3cc1a43c7e5c80aa758d1fa20b9ee7b70) | fix(ci): converter ci.yml para LF e corrigir formatacao (prettier) dos docs |
| 2026-09-26 | [35c42059](https://github.com/jeffaxe81/crm-vendas/commit/35c42059fde57c4acb7b10e1e766d194b4f55661) | fix(c4-1-6-territory-management): adicionar unique composto (territoryId, organizationId) em TerritoryMetrics |
| 2026-09-23 | [420b9ff8](https://github.com/jeffaxe81/crm-vendas/commit/420b9ff83734b7a066de4f9ed1639f451c2776e9) | fix(backend): make S1-04/S1-05 runnable, secure and tested |
| 2026-09-14 | [e79f07e0](https://github.com/jeffaxe81/crm-vendas/commit/e79f07e07a66cc40259b426e251d9cf14e87ee39) | fix(security): enforce tenant-aware company-contact integrity |
| 2026-09-13 | [5c0d3be2](https://github.com/jeffaxe81/crm-vendas/commit/5c0d3be266d3a8e79e016d0345918cede3c2ccf6) | fix(qa): preserve request id in denied access audit |
| 2026-09-13 | [41946b3b](https://github.com/jeffaxe81/crm-vendas/commit/41946b3b38eb0bd2924997a4b625652808777043) | fix(qa): expose correlation id on authenticated request |
| 2026-09-13 | [63128d01](https://github.com/jeffaxe81/crm-vendas/commit/63128d01b1e3c1e1607a6fdea8fd94610c55eb38) | fix(qa): await denied access audit before 403 |
| 2026-09-13 | [ce828e44](https://github.com/jeffaxe81/crm-vendas/commit/ce828e44211495c1c52c36ab4d24ea06cde21a81) | fix(qa): re-export audit dependency for permission guard |
| 2026-09-13 | [358c64d5](https://github.com/jeffaxe81/crm-vendas/commit/358c64d5a09777c3e38ccdad325e95665915ae2b) | fix: avoid blocking authorization on audit persistence |
| 2026-09-13 | [cdf6cbd0](https://github.com/jeffaxe81/crm-vendas/commit/cdf6cbd06d818dbac44647a306741533352a5ed0) | fix: pass public HTTP error shape to audit logger |
| 2026-09-13 | [1ed6b09c](https://github.com/jeffaxe81/crm-vendas/commit/1ed6b09c9ea3e77bbd5a120ce14fb263308b75eb) | fix: normalize denied access IP typing |
| 2026-09-13 | [18cfaef0](https://github.com/jeffaxe81/crm-vendas/commit/18cfaef07d758a145fa14984e5c24fcaa0cd240f) | fix: audit permission denials at guard boundary |
| 2026-09-13 | [915ff14c](https://github.com/jeffaxe81/crm-vendas/commit/915ff14cb3efba3c7b995d17b6c9f7b81146cabf) | fix: make audit logger available to permission guard |
| 2026-09-13 | [b648f9ea](https://github.com/jeffaxe81/crm-vendas/commit/b648f9ea452ffe7620c1f822d9a1af52dc2f2f68) | fix: export denied access logger for authorization guards |
| 2026-09-13 | [7f47639e](https://github.com/jeffaxe81/crm-vendas/commit/7f47639e48cd4f0654d060c34909ed1d3ea0ca2c) | fix: make denied access audit reusable across guards |
| 2026-09-13 | [c5562974](https://github.com/jeffaxe81/crm-vendas/commit/c55629747e029d6a5ecd92fd724e97b70811f7ea) | fix(c4.2.1): preservar resumo gerencial na navegação |
| 2026-09-13 | [0cd5db90](https://github.com/jeffaxe81/crm-vendas/commit/0cd5db900648a81cb1916710547a1481f991a440) | fix(c4.2.1): preservar contratos do resumo gerencial |
| 2026-09-13 | [f49f26d8](https://github.com/jeffaxe81/crm-vendas/commit/f49f26d88892aa10417933c126d7564ce8101ead) | fix(c4.2.1): preservar ReportsModule ao integrar importação CSV |
| 2026-09-13 | [8af8fd39](https://github.com/jeffaxe81/crm-vendas/commit/8af8fd39620c510dbb9b527b5ad57e143ec9dd9f) | fix(db): restore opportunity tenant integrity constraints |
| 2026-09-13 | [e674f6b4](https://github.com/jeffaxe81/crm-vendas/commit/e674f6b418c91a246c3e8e38a782272daca64db9) | fix(db): model tenant-safe opportunity relations |
| 2026-09-13 | [c7e650f1](https://github.com/jeffaxe81/crm-vendas/commit/c7e650f178ef52fc254ec0b1bed2a02f318b4cc8) | fix(api): keep Prisma test connection optional in Nest |
| 2026-09-13 | [45503175](https://github.com/jeffaxe81/crm-vendas/commit/45503175aa0aa388649d617e1c5a8172140ed3fc) | fix(ci): separate migration and application database URLs |
| 2026-09-13 | [b0cb5156](https://github.com/jeffaxe81/crm-vendas/commit/b0cb515600d1bd8b3e8ce2a0cd1f2f33dc0908c2) | fix(ci): provide disposable compose role credentials |
| 2026-09-13 | [c3f63abd](https://github.com/jeffaxe81/crm-vendas/commit/c3f63abd850dec2b5bba9f3d2a371fec08b83ad1) | fix(reports): use controllable clock for summary snapshot |
| 2026-09-13 | [263d4c1a](https://github.com/jeffaxe81/crm-vendas/commit/263d4c1aba70ef1b28bb73f18a32a57307fd37e8) | fix(import): normalize existing document whitespace |
| 2026-09-13 | [fc95047a](https://github.com/jeffaxe81/crm-vendas/commit/fc95047ab8db564cf29266753f627a637be39053) | fix(import): satisfy strict typing in CSV parser |
| 2026-09-12 | [ad048558](https://github.com/jeffaxe81/crm-vendas/commit/ad048558aa152893bd659f144ee8309658970345) | fix(import): satisfy strict CSV parser typing |
| 2026-09-12 | [e0eaeca6](https://github.com/jeffaxe81/crm-vendas/commit/e0eaeca6826c207d9e0641351e13279f795466eb) | fix(api): repair Docker build and activate RLS tenant isolation |
| 2026-09-10 | [21ea9888](https://github.com/jeffaxe81/crm-vendas/commit/21ea9888aea460796c09eeada141ea43274ec3be) | fix(crm): order activity opportunity migration after foundation |
| 2026-09-09 | [97fe7bf6](https://github.com/jeffaxe81/crm-vendas/commit/97fe7bf61c0c2cec82a49d11b3e0a11248d2f636) | fix(c3.4): create RLS stage fixture explicitly |
| 2026-09-09 | [bfe19233](https://github.com/jeffaxe81/crm-vendas/commit/bfe192332b6619aad2b48ddf9246e98d6580cbc0) | fix(c3.4): create pipeline stages explicitly in tenant transaction |
| 2026-09-09 | [29f6d2fe](https://github.com/jeffaxe81/crm-vendas/commit/29f6d2fe38e3788cca055a5279bccbc0885bb917) | fix(c3): execute contact channel operations in tenant context |
| 2026-09-07 | [0d1c8b2c](https://github.com/jeffaxe81/crm-vendas/commit/0d1c8b2c02bdea160d970413dcdbbcc5b1946fd5) | fix(web): deduplicate refresh rotation in Strict Mode |
| 2026-09-07 | [ff11eb93](https://github.com/jeffaxe81/crm-vendas/commit/ff11eb9392ab4ea5cfcba53c87afba91836fef9b) | fix(web): hydrate persisted contact relationship history |
| 2026-09-07 | [0cdbf2e8](https://github.com/jeffaxe81/crm-vendas/commit/0cdbf2e85580828ac2aa2dc500b7cbedd6331eaf) | fix(api): include persisted relationship history with contacts |
| 2026-09-07 | [7eee31d8](https://github.com/jeffaxe81/crm-vendas/commit/7eee31d8e928558bdc486113e55c1eff479f2b6f) | fix(api): include persisted contact channels in lists |
| 2026-09-07 | [019040a3](https://github.com/jeffaxe81/crm-vendas/commit/019040a3a9e00554d7d25bf8963a01f0a7664575) | fix(web): preserve contacts created during initial load |
| 2026-09-07 | [9f88a572](https://github.com/jeffaxe81/crm-vendas/commit/9f88a5724c162a6e98b1ab0b5103e24875c58cbb) | fix(web): stabilize contacts workspace interactions |
| 2026-09-05 | [497cc6b7](https://github.com/jeffaxe81/crm-vendas/commit/497cc6b7381dc24e02d51f0586f1538fb70935a1) | fix(web): install OpenSSL during workspace dependency build |
| 2026-09-05 | [c2eef395](https://github.com/jeffaxe81/crm-vendas/commit/c2eef395ac88bc6e94fcff736292b5f403a13e3a) | fix(api): install OpenSSL for Prisma containers |
| 2026-09-05 | [3e3846c7](https://github.com/jeffaxe81/crm-vendas/commit/3e3846c73cce52349633e3b27346e1eb3354afb9) | fix(web): allow Playwright development origin |
| 2026-09-05 | [847a1fdf](https://github.com/jeffaxe81/crm-vendas/commit/847a1fdfaef3e55beba40ff5ff7741a65e7809e3) | fix(authz): re-export guard dependency modules |
| 2026-09-01 | [68b296a0](https://github.com/jeffaxe81/crm-vendas/commit/68b296a056465cc443d13af484b31587b90b92a6) | fix(auth): remove ESM-only cookie runtime dependency |
| 2026-09-01 | [0276e98a](https://github.com/jeffaxe81/crm-vendas/commit/0276e98a0042eb0e472d0afcbc09ca112498bd32) | fix(authz): use explicit Reflector injection |
| 2026-09-01 | [1921cd27](https://github.com/jeffaxe81/crm-vendas/commit/1921cd27a76f1f5ce74b6c90e7263df30e5e4d1c) | fix(auth): use explicit controller dependency injection |
| 2026-09-01 | [3b744478](https://github.com/jeffaxe81/crm-vendas/commit/3b744478d37d1a9181bfba7c302fee6f321a3430) | fix(identity): default identity update timestamps |
| 2026-09-01 | [0faecda9](https://github.com/jeffaxe81/crm-vendas/commit/0faecda9763da0a06c760182544b81df1e7b227a) | fix(api): use explicit DI token for Prisma service |
| 2026-09-01 | [8b237560](https://github.com/jeffaxe81/crm-vendas/commit/8b237560b4ba78ec5f3405d29792d9db9ea83afd) | fix(api): use explicit DI token in health controller |
| 2026-09-01 | [f05d1d39](https://github.com/jeffaxe81/crm-vendas/commit/f05d1d398e9abed05790a6bd326d2acf767498b2) | fix(contracts): use ESM Vitest configuration |
| 2026-09-01 | [0e612d84](https://github.com/jeffaxe81/crm-vendas/commit/0e612d846e0545248712045b5e384c91eee2ec57) | fix(contracts): align Vitest config filename |
| 2026-09-01 | [f6488e7b](https://github.com/jeffaxe81/crm-vendas/commit/f6488e7b921240522a84a0c891b503b0f523cb82) | fix(observability): initialize logger independently from database env |
| 2026-09-01 | [9762fb07](https://github.com/jeffaxe81/crm-vendas/commit/9762fb0731a5119f9181a4c2ca1fce94a09642e4) | fix(container): persist PostgreSQL 18 at supported volume path |
| 2026-09-01 | [3f6903e0](https://github.com/jeffaxe81/crm-vendas/commit/3f6903e00e62241efc150558ed00f1fe43b704c8) | fix(database): use Prisma 7 PostgreSQL adapter contract |
| 2026-09-01 | [a35848b3](https://github.com/jeffaxe81/crm-vendas/commit/a35848b30cae1973167b296d175e3b76d479c86e) | fix(web): load root environment in Next |
| 2026-09-01 | [fd9b526c](https://github.com/jeffaxe81/crm-vendas/commit/fd9b526c8845484e61c450c873caa18963357ff9) | fix(web): add root environment loader |
| 2026-09-01 | [1d0fc191](https://github.com/jeffaxe81/crm-vendas/commit/1d0fc191812edacab938ec0e267d472f367a24ca) | fix(database): load root environment for Prisma |
| 2026-09-01 | [4b5eaf93](https://github.com/jeffaxe81/crm-vendas/commit/4b5eaf9326b229f08a44311b72e2b52d5c65fc14) | fix(config): load root environment in API |
