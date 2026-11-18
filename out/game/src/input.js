// Vice Meridian — input: WASD/arrows drive, Shift boosts, Space handbrake. Mouse drag orbits
// the chase camera around the car; the camera settles back behind the car with lag when released.

export function createInput() {
  const state = {
    forward: false, back: false, left: false, right: false, run: false,
    handbrake: false, horn: false,
    justHorn: false,
    camYaw: 0, camPitch: 0, pointerLocked: false,
    orbitX: 0, justOrbit: false,
  };
  let mouseX = 0, mouseY = 0;
  let orbitDrag = false;

  function onKey(event, pressed) {
    const code = event.code;
    switch (code) {
      case 'KeyW': case 'ArrowUp': state.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': state.back = pressed; break;
      case 'KeyA': case 'ArrowLeft': state.left = pressed; break;
      case 'KeyD': case 'ArrowRight': state.right = pressed; break;
      case 'ShiftLeft': case 'ShiftRight': state.run = pressed; break;
      case 'Space': state.handbrake = pressed; break;
      case 'KeyH': state.horn = pressed; if (pressed) state.justHorn = true; break;
      default:
    }
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  window.addEventListener('mousedown', (e) => { if (e.button === 0) orbitDrag = true; });
  window.addEventListener('mouseup', () => { orbitDrag = false; state.justOrbit = false; });
  window.addEventListener('mousemove', (e) => {
    mouseX += e.movementX;
    mouseY += e.movementY;
  });

  const sensitivity = 0.0015;
  return {
    read() {
      state.camYaw -= mouseX * sensitivity;
      state.camPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.camPitch - mouseY * sensitivity));
      mouseX = 0; mouseY = 0;
      state.justHorn = false;
      const result = { ...state, justOrbit: orbitDrag };
      if (orbitDrag) state.justOrbit = true;
      return result;
    },
    get state() { return state; },
    isOrbitDragging() { return orbitDrag; },
  };
}
