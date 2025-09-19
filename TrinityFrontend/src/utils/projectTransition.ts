import { NavigateFunction } from 'react-router-dom';

const EXIT_SELECTOR = '[data-project-transition], [data-project-card]';
const EXIT_CLASS = 'animate-project-exit';
const EXIT_STAGGER_MS = 120;
const EXIT_DURATION_MS = 500;
const EXIT_BUFFER_MS = 200;

const LAB_CLASS = 'animate-lab-element-enter';
const LAB_PREPARE_STYLE = {
  opacity: '0',
  transform: 'translateY(32px) scale(0.96)'
} as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isElementVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

export const startProjectTransition = (navigate: NavigateFunction) => {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    navigate('/laboratory');
    return;
  }

  const exitTargets = Array.from(document.querySelectorAll(EXIT_SELECTOR)) as HTMLElement[];

  const orderedTargets = exitTargets
    .map((element, index) => {
      const orderAttr = element.getAttribute('data-project-transition-order');
      const order =
        orderAttr !== null && orderAttr.trim() !== '' ? Number(orderAttr) : Number.NaN;
      return { element, order, index };
    })
    .filter(({ element }) => isElementVisible(element))
    .sort((a, b) => {
      const orderA = Number.isFinite(a.order) ? a.order : a.index;
      const orderB = Number.isFinite(b.order) ? b.order : b.index;
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    });

  orderedTargets.forEach(({ element }, sequenceIndex) => {
    element.style.setProperty('--project-exit-delay', `${sequenceIndex * EXIT_STAGGER_MS}ms`);
    element.style.willChange = 'opacity, transform';
    element.classList.add(EXIT_CLASS);

    const handleExitAnimationEnd = () => {
      element.style.willChange = '';
      element.removeEventListener('animationend', handleExitAnimationEnd);
    };

    element.addEventListener('animationend', handleExitAnimationEnd);
  });

  const totalExitTime = orderedTargets.length
    ? EXIT_DURATION_MS + EXIT_STAGGER_MS * (orderedTargets.length - 1) + EXIT_BUFFER_MS
    : 0;

  window.setTimeout(() => {
    navigate('/laboratory');
  }, totalExitTime);
};

export const animateLabElementsIn = () => {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    return;
  }

  const labElements = [
    { selector: '[data-lab-header]', delay: 0 },
    { selector: '[data-lab-toolbar]', delay: 160 },
    { selector: '[data-lab-sidebar]', delay: 320 },
    { selector: '[data-lab-canvas]', delay: 480 },
    { selector: '[data-lab-settings]', delay: 640 }
  ] as const;

  window.setTimeout(() => {
    labElements.forEach(({ selector, delay }) => {
      const element = document.querySelector(selector) as HTMLElement | null;

      if (!element || !isElementVisible(element)) {
        return;
      }

      element.classList.remove(LAB_CLASS);
      element.style.setProperty('--lab-enter-delay', `${delay}ms`);
      element.style.opacity = LAB_PREPARE_STYLE.opacity;
      element.style.transform = LAB_PREPARE_STYLE.transform;
      element.style.willChange = 'opacity, transform';

      window.requestAnimationFrame(() => {
        element.classList.add(LAB_CLASS);
      });

      const handleAnimationEnd = () => {
        element.style.opacity = '';
        element.style.transform = '';
        element.style.willChange = '';
        element.removeEventListener('animationend', handleAnimationEnd);
      };

      element.addEventListener('animationend', handleAnimationEnd);
    });
  }, 120);
};

export const cleanupProjectTransition = () => {
  if (typeof document === 'undefined') {
    return;
  }

  const allElements = document.querySelectorAll(
    '[data-project-transition], [data-project-card], [data-lab-header], [data-lab-toolbar], [data-lab-sidebar], [data-lab-canvas], [data-lab-settings]'
  );

  allElements.forEach((element) => {
    const target = element as HTMLElement;
    target.classList.remove(EXIT_CLASS, LAB_CLASS);
    target.style.opacity = '';
    target.style.transform = '';
    target.style.removeProperty('--project-exit-delay');
    target.style.removeProperty('--lab-enter-delay');
    target.style.willChange = '';
  });
};
