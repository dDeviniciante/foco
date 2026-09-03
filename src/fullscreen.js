const screenElement = document.querySelector('#focusScreen');
const timer = document.querySelector('#fullscreenTimer');
const intention = document.querySelector('#fullscreenIntention');
const progressCircle = document.querySelector('#progressCircle');
const primary = document.querySelector('#fullscreenPrimary');
const stop = document.querySelector('#fullscreenStop');
let currentState = { running: false, finished: false, hasSession: false, progress: 1 };

window.focusAPI.onTimerState(state => {
  currentState = state;
  document.documentElement.dataset.theme = state.theme;
  timer.textContent = state.time;
  timer.classList.toggle('long-time', state.time.length > 5);
  intention.textContent = state.intention || 'Aguardando uma sessão de foco.';
  progressCircle.style.setProperty('--progress', String(Math.max(0, Math.min(1, Number(state.progress) || 0))));
  screenElement.classList.toggle('running', state.running);
  screenElement.classList.toggle('finished', state.finished);
  stop.disabled = !state.hasSession;
  primary.textContent = state.finished ? 'PARAR ALARME' : state.running ? 'PAUSAR' : state.hasSession ? 'CONTINUAR' : 'COMEÇAR';
});

primary.addEventListener('click', () => {
  if (currentState.finished) {
    window.focusAPI.sendTimerCommand('silence');
    return window.focusAPI.dockFullscreen();
  }
  if (!currentState.hasSession) return window.focusAPI.requestFullscreenStart();
  window.focusAPI.sendTimerCommand('toggle');
});
timer.addEventListener('click', () => primary.click());
stop.addEventListener('click', () => window.focusAPI.stopFullscreen());
document.querySelector('#dockFullscreen').addEventListener('click', () => window.focusAPI.dockFullscreen());
window.focusAPI.sendTimerCommand('sync');
