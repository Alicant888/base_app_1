# UI + Background pack for Phaser 3 (RN WebView friendly)

Files:
- backgrounds.json (multiatlas)
  Images: BCG.png, L0.png, L1.png, L2.png, L3.png, L4.png, L5.png, L6.png
  Frames: BCG, L0, L1, L2, L3, L4, L5, L6
- ui.png / ui.json (1024x1024 atlas)
  Frames: ui_panel_window, ui_panel_header, ui_btn_large_normal/hover/pressed, ui_btn_small_normal/pressed,
          ui_icon_pause/back/sound_on/sound_off, ui_bar_hp, ui_bar_shield, ui_plate_score, ui_plate_weapon

Phaser loading:
```ts
this.load.multiatlas('bg', 'assets/atlases/backgrounds.json', 'assets/atlases/');
this.load.atlas('ui', 'assets/atlases/ui.png', 'assets/atlases/ui.json');
```

Background usage (tileSprite):
```ts
const bcg = this.add.tileSprite(0,0, this.scale.width, this.scale.height, 'bg', 'BCG').setOrigin(0,0);
const l4  = this.add.tileSprite(0,0, this.scale.width, this.scale.height, 'bg', 'L4').setOrigin(0,0);
const l5  = this.add.tileSprite(0,0, this.scale.width, this.scale.height, 'bg', 'L5').setOrigin(0,0);
const l6  = this.add.tileSprite(0,0, this.scale.width, this.scale.height, 'bg', 'L6').setOrigin(0,0);

// in update(dt):
bcg.tilePositionY -= 1.0;
l4.tilePositionY  -= 2.0;
l5.tilePositionY  -= 2.0;
l6.tilePositionY  -= 3.0;
```

UI usage:
```ts
this.add.image(80, 40, 'ui', 'ui_icon_pause');
this.add.image(180, 40, 'ui', 'ui_icon_sound_on');
const btn = this.add.image(this.scale.width/2, 500, 'ui', 'ui_btn_large_normal').setInteractive();
btn.on('pointerdown', ()=> btn.setFrame('ui_btn_large_pressed'));
btn.on('pointerup', ()=> btn.setFrame('ui_btn_large_hover'));
btn.on('pointerout', ()=> btn.setFrame('ui_btn_large_normal'));
```

Pixel-art settings (recommended):
- pixelArt: true
- antialias: false
- roundPixels: true
