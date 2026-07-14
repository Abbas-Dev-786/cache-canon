import { context, requestExpandedMode } from '@devvit/web/client';

const startButton = document.getElementById('start-button') as HTMLButtonElement;

startButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

const welcomeMessage = document.getElementById('welcome-message') as HTMLHeadingElement;

function init() {
  if (welcomeMessage) {
    welcomeMessage.textContent = `Hey ${context.username ?? 'Hunter'} 👋`;
    welcomeMessage.style.display = '';
  }
}

init();
