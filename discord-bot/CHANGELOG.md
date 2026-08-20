# Changelog

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
