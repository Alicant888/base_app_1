import Phaser from "phaser";
import type { Enemy, EnemyKind } from "../entities/Enemy";
import { GAME_WIDTH } from "../config";

export class EnemySpawner {
  private nextSpawnAt = 0;
  private bossSpawned = false;
  private boss?: Enemy;

  constructor(
    private scene: Phaser.Scene,
    private enemies: Phaser.Physics.Arcade.Group,
    private enemyBullets: Phaser.Physics.Arcade.Group,
  ) {}

  update(time: number) {
    // Boss fight: while the Dreadnought is alive, pause other spawns.
    if (this.boss?.active) return;

    // Spawn the boss once.
    if (!this.bossSpawned) {
      this.spawnBoss();
      this.bossSpawned = true;
      return;
    }

    if (time < this.nextSpawnAt) return;

    this.spawnOne();
    this.nextSpawnAt = time + Phaser.Math.Between(600, 1000);
  }

  private spawnBoss() {
    const x = GAME_WIDTH * 0.5;
    const y = -24;
    const speedY = 0;
    const kind: EnemyKind = "dreadnought";
    const hasShield = true;

    const enemy = this.enemies.get(x, y) as Enemy | null;
    if (!enemy) return;
    enemy.spawn(x, y, speedY, this.enemyBullets, kind, hasShield);
    this.boss = enemy;
  }

  private spawnOne() {
    const x = Phaser.Math.Between(24, GAME_WIDTH - 24);
    const y = -24;
    const speedY = Phaser.Math.Between(90, 160);
    // Regular enemies (boss is spawned separately).
    const r = Phaser.Math.FloatBetween(0, 1);
    const kind: EnemyKind =
      r < 0.01 ? "battlecruiser" : r < 0.02 ? "frigate" : r < 0.03 ? "torpedo" : r < 0.04 ? "fighter" : "scout";

    const hasShield =
      kind === "battlecruiser"
        ? Phaser.Math.FloatBetween(0, 1) < 0.1
        : kind === "frigate"
          ? Phaser.Math.FloatBetween(0, 1) < 0.5
          : kind === "torpedo"
            ? Phaser.Math.FloatBetween(0, 1) < 0.5
            : kind === "fighter"
              ? Phaser.Math.FloatBetween(0, 1) < 0.01
              : Phaser.Math.FloatBetween(0, 1) < 0.05;

    const enemy = this.enemies.get(x, y) as Enemy | null;
    if (!enemy) return;

    enemy.spawn(x, y, speedY, this.enemyBullets, kind, hasShield);
  }
}

