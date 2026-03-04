import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { OnboardingScene } from "./scenes/OnboardingScene";
import { PreloadScene } from "./scenes/PreloadScene";

export type GameRenderer = "auto" | "canvas" | "webgl";
export type GameAudioMode = "auto" | "html5" | "noaudio";

export interface CreateGameOptions {
  renderer?: GameRenderer;
  audioMode?: GameAudioMode;
}

/**
 * Creates a Phaser.Game instance.
 *
 * IMPORTANT (Next.js): call this only on the client, inside useEffect.
 */
export function createGame(parent: HTMLElement, options: CreateGameOptions = {}): Phaser.Game {
  const { renderer = "auto", audioMode = "auto" } = options;
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
    roundPixels: true,
    antialias: true,
    antialiasGL: true,
    render: {
      antialias: true,
      antialiasGL: false,
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
    scene: [PreloadScene, MenuScene, OnboardingScene, GameScene],
  };

  if (audioMode === "html5") config.audio = { disableWebAudio: true };
  else if (audioMode === "noaudio") config.audio = { noAudio: true };

  return new Phaser.Game(config);
}

