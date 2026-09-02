const timer = document.querySelector('#floatingTimer');
const intention = document.querySelector('#floatingIntention');
const shell = document.querySelector('#floatingShell');
let finished = false;
let adaptiveContrastEnabled = false;

window.focusAPI.onTimerState(state => {
  timer.textContent = state.time;
  intention.textContent = state.intention || 'Aguardando uma sessão de foco.';
  document.documentElement.dataset.theme = state.theme;
  adaptiveContrastEnabled = state.adaptiveContrast === true;
  if (!adaptiveContrastEnabled) delete document.documentElement.dataset.adaptive;
  const rawOpacity = Number(state.backgroundOpacity);
  const opacity = Math.max(0, Math.min(1, Number.isFinite(rawOpacity) ? rawOpacity : .92));
  shell.style.backgroundColor = state.theme === 'dark'
    ? `rgba(28, 31, 29, ${opacity})`
    : `rgba(255, 253, 248, ${opacity})`;
  const dotColor = state.theme === 'dark' ? '170, 168, 160' : '119, 118, 111';
  shell.style.backgroundImage = opacity <= .05
    ? 'none'
    : `radial-gradient(circle, rgba(${dotColor}, ${opacity * .28}) .7px, transparent .8px)`;
  shell.classList.toggle('fully-transparent', opacity <= .05);
  shell.classList.toggle('running', state.running);
  shell.classList.toggle('finished', state.finished);
  finished = state.finished;
});

window.focusAPI.onAdaptiveContrast(contrast => {
  if (!adaptiveContrastEnabled || contrast === 'theme') delete document.documentElement.dataset.adaptive;
  else document.documentElement.dataset.adaptive = contrast;
});

timer.addEventListener('click', () => window.focusAPI.sendTimerCommand(finished ? 'silence' : 'toggle'));
document.querySelector('#dockFloating').addEventListener('click', () => window.focusAPI.dockFloating());
document.querySelectorAll('.resize-zone').forEach(zone => {
  zone.addEventListener('pointerdown', event => {
    event.preventDefault();
    zone.setPointerCapture(event.pointerId);
    let lastX = event.screenX;
    let lastY = event.screenY;
    const edge = zone.dataset.edge;
    const resize = moveEvent => {
      const dx = moveEvent.screenX - lastX;
      const dy = moveEvent.screenY - lastY;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      if (dx || dy) window.focusAPI.resizeFloatingBy(edge, dx, dy);
    };
    const finish = () => {
      zone.removeEventListener('pointermove', resize);
      zone.removeEventListener('pointerup', finish);
      zone.removeEventListener('pointercancel', finish);
    };
    zone.addEventListener('pointermove', resize);
    zone.addEventListener('pointerup', finish);
    zone.addEventListener('pointercancel', finish);
  });
});
window.focusAPI.sendTimerCommand('sync');
