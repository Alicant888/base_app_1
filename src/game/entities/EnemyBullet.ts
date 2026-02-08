import Phaser from "phaser";
import { ATLAS_KEYS, GAME_HEIGHT, SPRITE_FRAMES } from "../config";

const ENEMY_BULLET_SPEED = 240;

export class EnemyBullet extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ATLAS_KEYS.enemy, `${SPRITE_FRAMES.enemyProjectilePrefix}${SPRITE_FRAMES.enemyProjectileStart}${SPRITE_FRAMES.enemyProjectileSuffix}`);

    this.setActive(false);
    this.setVisible(false);
    this.setDepth(4);
  }

  fire(x: number, y: number) {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);

    body.enable = true;
    body.reset(x, y);
    body.allowGravity = false;

    this.setVelocity(0, ENEMY_BULLET_SPEED);
    this.play("enemy_bullet");

    // Small hitbox.
    body.setSize(this.width * 0.7, this.height * 0.7, true);
  }

  kill() {
    this.setActive(false);
    this.setVisible(false);
    this.anims.stop();

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.stop();
      body.enable = false;
    }
  }

  update() {
    if (!this.active) return;
    if (this.y > GAME_HEIGHT + 32) this.kill();
  }
}

