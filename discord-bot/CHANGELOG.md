# Changelog

## [1.3.0](https://github.com/GameOnPortugal/monorepo/compare/discord-bot-v1.2.0...discord-bot-v1.3.0) (2026-08-21)


### Features

* **bot:** add member privacy opt-out and GDPR erasure (M9.7) ([#66](https://github.com/GameOnPortugal/monorepo/issues/66)) ([07b65ad](https://github.com/GameOnPortugal/monorepo/commit/07b65add0c76bafd3e38b564da681d1b04b0b55f))

## [1.2.0](https://github.com/GameOnPortugal/monorepo/compare/discord-bot-v1.1.0...discord-bot-v1.2.0) (2026-08-21)


### Features

* **bot:** guild-scoped dev registration, command-set hashing and a ManageMessages admin check (M4.3, M1.10) ([#34](https://github.com/GameOnPortugal/monorepo/issues/34)) ([5af2e6d](https://github.com/GameOnPortugal/monorepo/commit/5af2e6d2676bd8bd7115d7f4a02ef2d081643335))
* **bot:** reimplement channel moderation on Discord AutoMod (M9.1) ([#51](https://github.com/GameOnPortugal/monorepo/issues/51)) ([8e41101](https://github.com/GameOnPortugal/monorepo/commit/8e4110177d027ff19986d9a43276e7ddf7274bc3))
* **bot:** route components and autocomplete, and retire the positional delete hack (M4.7, M4.8) ([#42](https://github.com/GameOnPortugal/monorepo/issues/42)) ([16b8855](https://github.com/GameOnPortugal/monorepo/commit/16b88558d5705ee2b880e80b260a087cd03355ed))
* **bot:** type the interaction layer, defer every slow handler and bound embed output (M4.1, M4.2, M4.10) ([#27](https://github.com/GameOnPortugal/monorepo/issues/27)) ([c2160ae](https://github.com/GameOnPortugal/monorepo/commit/c2160aea159507681564f051e63578500b3ccfeb))
* **bot:** validate env at boot, harden the client lifecycle and cap attachment ingest (M1.3, M1.4, M4.4, M4.5, M4.6, M4.9) ([#28](https://github.com/GameOnPortugal/monorepo/issues/28)) ([bbbf271](https://github.com/GameOnPortugal/monorepo/commit/bbbf2711181c36050157f83116410c7616833993))
* **db:** drop the seven dead models for LFG, stock alerts and channel config (M9.2, M9.3, M9.4, M9.6) ([#33](https://github.com/GameOnPortugal/monorepo/issues/33)) ([4c3249a](https://github.com/GameOnPortugal/monorepo/commit/4c3249ad025610e097a051505e8b416d61ccdf60))
* **marketplace:** add ad lifecycle columns, indexes and adType normalisation (M5.3) ([#29](https://github.com/GameOnPortugal/monorepo/issues/29)) ([8986453](https://github.com/GameOnPortugal/monorepo/commit/8986453ebb0327d10839b79346e64c641b96e1d4))
* **marketplace:** add the ads lifecycle and reconcile jobs (M6.5, M6.6) ([#40](https://github.com/GameOnPortugal/monorepo/issues/40)) ([46eff09](https://github.com/GameOnPortugal/monorepo/commit/46eff09f6450e4cc288fab36b09c6d27accec1d7))
* **marketplace:** listing embed, buttons and shared sold/bump/edit handlers (M5.4, M5.5, M5.6) ([#49](https://github.com/GameOnPortugal/monorepo/issues/49)) ([8df0e5b](https://github.com/GameOnPortugal/monorepo/commit/8df0e5b02dd99376cdf2d5243ba97739c2108d5b))
* **marketplace:** post listings to #anuncios and make delete remove the message and soft-delete the row (M5.1, M5.2) ([#35](https://github.com/GameOnPortugal/monorepo/issues/35)) ([21522df](https://github.com/GameOnPortugal/monorepo/commit/21522dfd672d531c0fb0e54c2299db0507415601))
* **marketplace:** wanted ads, paginated list, and search (M5.7-M5.9) ([#57](https://github.com/GameOnPortugal/monorepo/issues/57)) ([20f9515](https://github.com/GameOnPortugal/monorepo/commit/20f9515f5724e4e4b1b71ee4287798c76b1d6513))
* **media:** add a MediaStorage port and S3/MinIO adapter so images can be durably re-hosted (M6.0) ([#30](https://github.com/GameOnPortugal/monorepo/issues/30)) ([638e7e6](https://github.com/GameOnPortugal/monorepo/commit/638e7e6444431d44b3fd7a3e0d554853d9920785))
* **scheduler:** add an in-process job runner with dry-run, work limits and run reporting (M6.1, M6.8) ([#32](https://github.com/GameOnPortugal/monorepo/issues/32)) ([1b5c817](https://github.com/GameOnPortugal/monorepo/commit/1b5c8172628874a192d434c39869ee585b151d72))
* **screenshots:** harden the weekly winner job — ties, vanished messages, pt-PT copy, no !give-xp (M6.4) ([#31](https://github.com/GameOnPortugal/monorepo/issues/31)) ([481852a](https://github.com/GameOnPortugal/monorepo/commit/481852a2c0fcf5e8120b9f0c7b667155f0e7f521))
* **screenshots:** re-host images at submit time and add the relink recovery job (M6.2, M6.3) ([#37](https://github.com/GameOnPortugal/monorepo/issues/37)) ([94dc6cf](https://github.com/GameOnPortugal/monorepo/commit/94dc6cf4060fb5b511fa2bb6ef684a2b23159624))
* **trophies:** add the sync job, live rank on check, both create URL shapes and the completion-date backfill (M7.3, M7.4, M7.5, M7.7) ([#39](https://github.com/GameOnPortugal/monorepo/issues/39)) ([cbdba21](https://github.com/GameOnPortugal/monorepo/commit/cbdba21de9e0115644d7a87be940511b7dd4f613))
* **trophies:** announce newly-credited trophies through the bot (M7.8) ([#46](https://github.com/GameOnPortugal/monorepo/issues/46)) ([c1bf502](https://github.com/GameOnPortugal/monorepo/commit/c1bf502f61a1da33794ec5dc2caf92961accc95c))
* **trophies:** restore custom rank emojis and add pagination buttons (M7.6) ([#50](https://github.com/GameOnPortugal/monorepo/issues/50)) ([de2afbd](https://github.com/GameOnPortugal/monorepo/commit/de2afbd72fc5185b28b376179461e7fdf0088e34))
* **trophy:** port the PSNProfiles source and points ladder behind a domain port (M7.1, M7.2) ([#24](https://github.com/GameOnPortugal/monorepo/issues/24)) ([1462f95](https://github.com/GameOnPortugal/monorepo/commit/1462f95cc2ae04125c1df67d4879a609dadbd06b))


### Bug Fixes

* **bot:** pin one connection when truncating test tables ([#52](https://github.com/GameOnPortugal/monorepo/issues/52)) ([b0d2dae](https://github.com/GameOnPortugal/monorepo/commit/b0d2dae903b6f9410269e852c9643f67ef4457d5))
* **ci:** wait for the entrypoint to finish before resetting the test database ([#43](https://github.com/GameOnPortugal/monorepo/issues/43)) ([c6d3c4a](https://github.com/GameOnPortugal/monorepo/commit/c6d3c4aa0d5ae910340fe01cd32df6aed1b28f0b))
* **scheduler:** stop the weekly winner job failing on an "undefined" date ([#36](https://github.com/GameOnPortugal/monorepo/issues/36)) ([9b39887](https://github.com/GameOnPortugal/monorepo/commit/9b398872e197f61f2468aaf1bdb40f0eeb6551bd))

## [1.1.0](https://github.com/GameOnPortugal/monorepo/compare/discord-bot-v1.0.0...discord-bot-v1.1.0) (2026-08-20)


### Features

* **bot:** externalise Discord IDs and fix .env.example ([#18](https://github.com/GameOnPortugal/monorepo/issues/18)) ([ad5cdb0](https://github.com/GameOnPortugal/monorepo/commit/ad5cdb0500e47995a2c2c99042ce2d5b33f58fbb))


### Bug Fixes

* **bot:** close mention-injection hole and fix broken ephemeral/double-reply handling ([#14](https://github.com/GameOnPortugal/monorepo/issues/14)) ([b4c90df](https://github.com/GameOnPortugal/monorepo/commit/b4c90dfa4970198b04595e8477d20f5656ce2747))
* **bot:** stop trusting any TLS certificate and clear M1.8 dead ends ([#12](https://github.com/GameOnPortugal/monorepo/issues/12)) ([0e4d51c](https://github.com/GameOnPortugal/monorepo/commit/0e4d51c58a2946038edfceebf853c46f76facdf6))
* **docker:** stop logging the database password and bound the readiness wait ([#11](https://github.com/GameOnPortugal/monorepo/issues/11)) ([e7747d8](https://github.com/GameOnPortugal/monorepo/commit/e7747d85859544fffe547a6b990d5c3f1c3802f9))
* **marketplace:** stop /marketplace sell from silently corrupting message_id ([#15](https://github.com/GameOnPortugal/monorepo/issues/15)) ([b70216d](https://github.com/GameOnPortugal/monorepo/commit/b70216d78acaa93699bcae9d62e1208dd673ce9f))
* **trophies:** aggregate and order trophy rankings in SQL ([#13](https://github.com/GameOnPortugal/monorepo/issues/13)) ([510db33](https://github.com/GameOnPortugal/monorepo/commit/510db33233cd5e00a035f9d11b9db71b3534feeb))

## 1.0.0 (2026-08-19)


### Features

* enable screenshot winner. run commands ([c28a73f](https://github.com/GameOnPortugal/monorepo/commit/c28a73f05d629345a634b9bace66181d70d2dbb2))
* revive the project — docs, Portainer CI/CD, release-please, and schema fixes ([#3](https://github.com/GameOnPortugal/monorepo/issues/3)) ([8fd49f1](https://github.com/GameOnPortugal/monorepo/commit/8fd49f1a5f569d84e5f3f86c0d4641b7c82eee0a))
