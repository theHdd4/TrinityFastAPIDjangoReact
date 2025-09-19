import { NavigateFunction } from 'react-router-dom';

export const startProjectTransition = (navigate: NavigateFunction) => {
  if (typeof document === 'undefined') {
    navigate('/laboratory');
    return;
  }

  const projectCards = document.querySelectorAll('[data-project-card]');
  console.log('Found project cards:', projectCards.length);

  projectCards.forEach((card, index) => {
    setTimeout(() => {
      console.log('Animating card', index);
      (card as HTMLElement).classList.add('animate-project-exit');
    }, index * 150);
  });

  const totalExitTime = projectCards.length * 150 + 500;
  setTimeout(() => {
    navigate('/laboratory');
  }, totalExitTime);
};

export const animateLabElementsIn = () => {
  if (typeof document === 'undefined') {
    return;
  }

  console.log('Starting lab elements animation');

  setTimeout(() => {
    const labElements = [
      { selector: '[data-lab-header]', delay: 0, name: 'header' },
      { selector: '[data-lab-toolbar]', delay: 200, name: 'toolbar' },
      { selector: '[data-lab-sidebar]', delay: 400, name: 'sidebar' },
      { selector: '[data-lab-canvas]', delay: 600, name: 'canvas' },
      { selector: '[data-lab-settings]', delay: 800, name: 'settings' }
    ];

    labElements.forEach(({ selector, delay, name }) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      console.log(`Found ${name} element:`, !!element);

      if (element) {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px) scale(0.95)';

        setTimeout(() => {
          console.log(`Animating ${name} element`);
          element.classList.add('animate-lab-element-enter');
        }, delay);
      }
    });
  }, 200);
};

export const cleanupProjectTransition = () => {
  if (typeof document === 'undefined') {
    return;
  }

  console.log('Cleaning up project transition');
  const allElements = document.querySelectorAll(
    '[data-project-card], [data-lab-header], [data-lab-toolbar], [data-lab-sidebar], [data-lab-canvas], [data-lab-settings]'
  );
  allElements.forEach((element) => {
    (element as HTMLElement).classList.remove('animate-project-exit', 'animate-lab-element-enter');
    (element as HTMLElement).style.opacity = '';
    (element as HTMLElement).style.transform = '';
  });
};
