import Phaser from "phaser";
import { EnemyBullet } from "./EnemyBullet";
import { ATLAS_KEYS, AUDIO_KEYS, GAME_HEIGHT, SPRITE_FRAMES } from "../config";

export type EnemyKind = "scout" | "fighter";

const FIGHTER_HP = 2;
const FIGHTER_SHIELD_HP = 2;
const FIGHTER_BULLET_OFFSET_X = 6;
const FIGHTER_WEAPON_FIRE_RIGHT_FRAME = `${SPRITE_FRAMES.fighterWeaponPrefix}1${SPRITE_FRAMES.fighterWeaponSuffix}`;
const FIGHTER_WEAPON_FIRE_LEFT_FRAME = `${SPRITE_FRAMES.fighterWeaponPrefix}3${SPRITE_FRAMES.fighterWeaponSuffix}`;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private engineFx: Phaser.GameObjects.Sprite;
  private shieldFx: Phaser.GameObjects.Sprite;
  private weaponFx: Phaser.GameObjects.Sprite;
  private enemyBullets?: Phaser.Physics.Arcade.Group;

  private nextFireAt = 0;
  private isFiring = false;
  private kind: EnemyKind = "scout";
  private hp = 1;
  private shieldHp = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ATLAS_KEYS.enemy, SPRITE_FRAMES.enemyBase);

    this.setActive(false);
    this.setVisible(false);
    this.setDepth(4);

    // Visual FX sprites (not part of the physics body).
    this.engineFx = scene.add
      .sprite(x, y, ATLAS_KEYS.enemy, `${SPRITE_FRAMES.enemyEnginePrefix}${SPRITE_FRAMES.enemyEngineStart}${SPRITE_FRAMES.enemyEngineSuffix}`)
      .setOrigin(0.5, 1)
      .setDepth(3)
      .setVisible(false);

    this.shieldFx = scene.add
      .sprite(x, y, ATLAS_KEYS.enemy, `${SPRITE_FRAMES.enemyShieldPrefix}${SPRITE_FRAMES.enemyShieldStart}${SPRITE_FRAMES.enemyShieldSuffix}`)
      .setDepth(6)
      .setVisible(false);

    this.weaponFx = scene.add
      .sprite(x, y, ATLAS_KEYS.enemy, `${SPRITE_FRAMES.enemyWeaponPrefix}${SPRITE_FRAMES.enemyWeaponStart}${SPRITE_FRAMES.enemyWeaponSuffix}`)
      .setDepth(5)
      .setVisible(false);
  }

  spawn(
    x: number,
    y: number,
    speedY: number,
    enemyBullets: Phaser.Physics.Arcade.Group,
    kind: EnemyKind,
    hasShield: boolean,
  ) {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    this.kind = kind;
    this.enemyBullets = enemyBullets;

    const isFighter = this.kind === "fighter";
    this.hp = isFighter ? FIGHTER_HP : 1;
    this.shieldHp = isFighter ? (hasShield ? FIGHTER_SHIELD_HP : 0) : hasShield ? 1 : 0;

    this.setFrame(isFighter ? SPRITE_FRAMES.fighterBase : SPRITE_FRAMES.enemyBase);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setFlipY(true); // face downward

    body.enable = true;
    body.reset(x, y);

    body.allowGravity = false;
    this.setVelocity(0, speedY);

    // Smaller, forgiving hitbox.
    body.setSize(this.width * 0.7, this.height * 0.7, true);

    // Engine loop.
    const engineFrame = isFighter
      ? `${SPRITE_FRAMES.fighterEnginePrefix}${SPRITE_FRAMES.fighterEngineStart}${SPRITE_FRAMES.fighterEngineSuffix}`
      : `${SPRITE_FRAMES.enemyEnginePrefix}${SPRITE_FRAMES.enemyEngineStart}${SPRITE_FRAMES.enemyEngineSuffix}`;
    this.engineFx.setFrame(engineFrame);
    this.engineFx.setVisible(true);
    this.engineFx.setFlipY(true);
    this.engineFx.play(isFighter ? "fighter_engine" : "enemy_engine", true);

    // Shield. Scout: optional (1 HP). Fighter: optional (2 HP).
    if (this.shieldHp > 0) {
      const shieldFrame = isFighter
        ? `${SPRITE_FRAMES.fighterShieldPrefix}${SPRITE_FRAMES.fighterShieldStart}${SPRITE_FRAMES.fighterShieldSuffix}`
        : `${SPRITE_FRAMES.enemyShieldPrefix}${SPRITE_FRAMES.enemyShieldStart}${SPRITE_FRAMES.enemyShieldSuffix}`;
      this.shieldFx.setFrame(shieldFrame);
      this.shieldFx.setVisible(true);
      this.shieldFx.setFlipY(true);
      this.shieldFx.play(isFighter ? "fighter_shield" : "enemy_shield", true);
    } else {
      this.shieldFx.setVisible(false);
      this.shieldFx.anims.stop();
    }

    // Weapon FX is off until firing.
    const weaponFrame = isFighter
      ? `${SPRITE_FRAMES.fighterWeaponPrefix}${SPRITE_FRAMES.fighterWeaponStart}${SPRITE_FRAMES.fighterWeaponSuffix}`
      : `${SPRITE_FRAMES.enemyWeaponPrefix}${SPRITE_FRAMES.enemyWeaponStart}${SPRITE_FRAMES.enemyWeaponSuffix}`;
    this.weaponFx.setFrame(weaponFrame);
    this.weaponFx.setVisible(false);
    this.weaponFx.setFlipY(true);
    this.weaponFx.anims.stop();
    this.weaponFx.removeAllListeners();

    this.isFiring = false;
    this.nextFireAt = this.scene.time.now + Phaser.Math.Between(850, 1400);

    // IMPORTANT: This enemy is pooled and its FX sprites are separate GameObjects.
    // Sync their positions immediately on spawn to avoid a 1-frame "flicker" at the
    // previous pooled position (especially noticeable for shielded enemies).
    this.syncFxPositions();
  }

  kill() {
    this.setActive(false);
    this.setVisible(false);

    this.isFiring = false;
    this.hp = 0;
    this.shieldHp = 0;
    this.engineFx.setVisible(false);
    this.shieldFx.setVisible(false);
    this.shieldFx.anims.stop();
    this.weaponFx.setVisible(false);
    this.weaponFx.anims.stop();
    this.weaponFx.removeAllListeners();

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.stop();
      body.enable = false;
    }
  }

  update(time: number) {
    if (!this.active) return;
    this.syncFxPositions();

    if (!this.isFiring && this.enemyBullets && time >= this.nextFireAt) {
      this.startFiringSequence();
    }
    if (this.y > GAME_HEIGHT + 48) this.kill();
  }

  override destroy(fromScene?: boolean) {
    this.engineFx.destroy();
    this.shieldFx.destroy();
    this.weaponFx.destroy();
    super.destroy(fromScene);
  }

  /**
   * Returns true if the enemy should be destroyed by this hit.
   */
  onPlayerBulletHit(damage = 1): boolean {
    if (!this.active) return false;

    let remaining = Math.max(0, damage);

    if (this.shieldHp > 0 && remaining > 0) {
      const shieldBefore = this.shieldHp;
      this.shieldHp = Math.max(0, this.shieldHp - remaining);
      remaining = Math.max(0, remaining - shieldBefore);

      if (this.shieldHp === 0) {
        this.breakShield();
      }
    }

    if (remaining > 0) {
      this.hp = Math.max(0, this.hp - remaining);
    }

    return this.hp <= 0;
  }

  getKind(): EnemyKind {
    return this.kind;
  }

  private syncFxPositions() {
    // Anchor engine FX close to the enemy body.
    // Engine frames are trimmed inside a larger "real" frame, so we position
    // relative to the enemy bounds (not engineFx displayHeight) to avoid detaching.
    const top = this.getTopCenter();
    // With origin (0.5, 1) this pins the bottom of the flame to the top of the ship.
    // Engine frames have a lot of transparent space (trim) below the visible flame,
    // so we push the sprite down to keep the visible pixels tight to the ship.
    this.engineFx.setPosition(top.x, top.y + 32);

    this.shieldFx.setPosition(this.x, this.y);

    // Weapon frames are trimmed differently; placing it at the same position prevents it
    // from looking like a second ship that spawns ahead of the enemy.
    this.weaponFx.setPosition(this.x, this.y);
  }

  private breakShield() {
    this.shieldFx.setVisible(false);
    this.shieldFx.anims.stop();

    // Tiny feedback flash.
    this.setTintFill(0x7df9ff);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      this.clearTint();
    });
  }

  private startFiringSequence() {
    if (!this.enemyBullets) return;

    this.isFiring = true;
    this.weaponFx.setVisible(true);
    this.weaponFx.removeAllListeners();

    if (this.kind === "fighter") {
      let firedRight = false;
      let firedLeft = false;
      let playedSfx = false;

      const tryPlaySfx = () => {
        if (playedSfx) return;
        playedSfx = true;
        if (!this.scene.registry.get("audioUnlocked")) return;
        try {
          this.scene.sound.play(AUDIO_KEYS.laserScout, { volume: 0.35 });
        } catch {
          // ignore
        }
      };

      // Sync right/left shots to specific weapon frames.
      this.weaponFx.on(
        Phaser.Animations.Events.ANIMATION_UPDATE,
        (_animation: Phaser.Animations.Animation, _frame: Phaser.Animations.AnimationFrame, _gameObject: Phaser.GameObjects.Sprite, frameKey: string) => {
          if (!this.active) return;
          if (!this.enemyBullets) return;

          const x = this.x;
          const y = this.y + (this.displayHeight || 24) * 0.15;

          if (frameKey === FIGHTER_WEAPON_FIRE_RIGHT_FRAME && !firedRight) {
            firedRight = true;
            const fired = this.spawnEnemyBulletAt(x + FIGHTER_BULLET_OFFSET_X, y);
            if (fired) tryPlaySfx();
            return;
          }

          if (frameKey === FIGHTER_WEAPON_FIRE_LEFT_FRAME && !firedLeft) {
            firedLeft = true;
            const fired = this.spawnEnemyBulletAt(x - FIGHTER_BULLET_OFFSET_X, y);
            if (fired) tryPlaySfx();
          }
        },
      );

      this.weaponFx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.weaponFx.setVisible(false);
        this.weaponFx.removeAllListeners();

        this.isFiring = false;
        this.nextFireAt = this.scene.time.now + Phaser.Math.Between(900, 1600);
      });

      this.weaponFx.play("fighter_weapon_flame", true);
      return;
    }

    // Scout: flame animation before a single shot.
    this.weaponFx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.weaponFx.setVisible(false);
      this.weaponFx.removeAllListeners();
      this.spawnBullets();

      this.isFiring = false;
      this.nextFireAt = this.scene.time.now + Phaser.Math.Between(900, 1600);
    });

    this.weaponFx.play("enemy_weapon_flame", true);
  }

  private spawnEnemyBulletAt(x: number, y: number): boolean {
    if (!this.enemyBullets) return false;
    const bullet = this.enemyBullets.get(x, y) as EnemyBullet | null;
    if (!bullet) return false;
    bullet.fire(x, y);
    return true;
  }

  private spawnBullets() {
    if (!this.enemyBullets) return;

    const x = this.x;
    const y = this.y + (this.displayHeight || 24) * 0.15;
    const firedAny = this.spawnEnemyBulletAt(x, y);

    if (firedAny && this.scene.registry.get("audioUnlocked")) {
      try {
        this.scene.sound.play(AUDIO_KEYS.laserScout, { volume: 0.35 });
      } catch {
        // ignore
      }
    }
  }
}

