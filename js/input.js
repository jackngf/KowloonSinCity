/** Keyboard + mouse input with pointer lock */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftDown: false, rightDown: false };
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'KeyR', 'KeyF', 'KeyE'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftDown = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightDown = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
  }

  consumeMouseDelta() {
    const d = { x: this.mouse.dx, y: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return d;
  }

  consumeClick(btn) {
    if (btn === 'left') {
      const v = this.mouse.leftDown;
      this.mouse.leftDown = false;
      return v;
    }
    if (btn === 'right') {
      const v = this.mouse.rightDown;
      this.mouse.rightDown = false;
      return v;
    }
    return false;
  }

  pressed(code) { return !!this.keys[code]; }

  /** one-shot edge detector helper */
  edge(map, code) {
    const now = this.pressed(code);
    const was = !!map[code];
    map[code] = now;
    return now && !was;
  }
}
