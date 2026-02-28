import * as Phaser from "phaser";
import { GAME_HEIGHT } from "../config";

const BULLET_SPEED = 420;

/** Degrees-to-radians multiplier. */
const DEG2RAD = Math.PI / 180;

export class Bullet extends Phaser.Physics.Arcade.Image {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "bullet");

    this.setActive(false);
    this.setVisible(false);
    this.setDepth(1.5);
  }

  fire(x: number, y: number, angleDeg = 0) {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);

    body.enable = true;
    body.reset(x, y);

    body.allowGravity = false;

    if (angleDeg === 0) {
      this.setRotation(0);
      this.setVelocity(0, -BULLET_SPEED);
    } else {
      const rad = angleDeg * DEG2RAD;
      this.setRotation(rad);
      this.setVelocity(Math.sin(rad) * BULLET_SPEED, -Math.cos(rad) * BULLET_SPEED);
    }
  }

  kill() {
    this.setActive(false);
    this.setVisible(false);
    this.setRotation(0);

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.stop();
      body.enable = false;
    }
  }

  update() {
    if (!this.active) return;
    if (this.y < -16) this.kill();
    // Safety: if something pushes the bullet down, recycle it too.
    if (this.y > GAME_HEIGHT + 16) this.kill();
  }
}

