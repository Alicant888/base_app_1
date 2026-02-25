import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { PreloadScene } from "./scenes/PreloadScene";

export type GameRenderer = "auto" | "canvas" | "webgl";

export interface CreateGameOptions {
  renderer?: GameRenderer;
}

/**
 * Creates a Phaser.Game instance.
 *
 * IMPORTANT (Next.js): call this only on the client, inside useEffect.
 */
export function createGame(parent: HTMLElement, options: CreateGameOptions = {}): Phaser.Game {
  const { renderer = "auto" } = options;
  const type = renderer === "canvas" ? Phaser.CANVAS : renderer === "webgl" ? Phaser.WEBGL : Phaser.AUTO;

  const parentRect = parent.getBoundingClientRect();
  const initialWidth = Math.max(1, Math.round(parentRect.width || window.innerWidth || GAME_WIDTH));
  const initialHeight = Math.max(1, Math.round(parentRect.height || window.innerHeight || GAME_HEIGHT));

  const config: Phaser.Types.Core.GameConfig = {
    type,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#000000",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
    },
    disableContextMenu: true,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: initialWidth,
      height: initialHeight,
    },
    scene: [PreloadScene, MenuScene, GameScene],
  };

  return new Phaser.Game(config);
}

