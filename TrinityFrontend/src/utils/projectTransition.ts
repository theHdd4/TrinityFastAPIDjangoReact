import { NavigateFunction } from 'react-router-dom';

const EXIT_SELECTOR = '[data-project-transition], [data-project-card]';
const EXIT_CLASS = 'animate-project-exit';
const EXIT_STAGGER_MS = 120;
const EXIT_DURATION_MS = 500;
const EXIT_BUFFER_MS = 200;

const LAB_CLASS = 'animate-lab-element-enter';
const LAB_PREPARE_STYLE = {
  opacity: '0',
  transform: 'translateY(30px) scale(0.95)'
} as const;
const LAB_ELEMENTS = [
  { selector: '[data-lab-header]', delay: 0 },
  { selector: '[data-lab-toolbar]', delay: 200 },
  { selector: '[data-lab-sidebar]', delay: 400 },
  { selector: '[data-lab-canvas]', delay: 600 },
  { selector: '[data-lab-settings]', delay: 800 }
] as const;
const LAB_PREP_DELAY_MS = 200;
const LAB_ANIMATION_DURATION_MS = 600;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isElementVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const parseTimeoutIds = (value: string | undefined) =>
  (value || '')
    .split(',')
    .map(id => Number(id))
    .filter(id => Number.isFinite(id));

const clearLabElementTimeouts = (element: HTMLElement) => {
  parseTimeoutIds(element.dataset.labTransitionTimeouts).forEach(id => {
    window.clearTimeout(id);
  });
  delete element.dataset.labTransitionTimeouts;
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

  window.setTimeout(() => {
    LAB_ELEMENTS.forEach(({ selector, delay }) => {
      const element = document.querySelector(selector) as HTMLElement | null;

      if (!element || !isElementVisible(element)) {
        return;
      }

      clearLabElementTimeouts(element);
      element.classList.remove(LAB_CLASS);
      element.style.opacity = LAB_PREPARE_STYLE.opacity;
      element.style.transform = LAB_PREPARE_STYLE.transform;
      element.style.willChange = 'opacity, transform';

      const ensureVisible = () => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0) scale(1)';
        element.style.willChange = '';
      };

      let fallbackTimeout = 0;

      const handleAnimationEnd = () => {
        ensureVisible();
        element.removeEventListener('animationend', handleAnimationEnd);
        window.clearTimeout(fallbackTimeout);
        clearLabElementTimeouts(element);
      };

      fallbackTimeout = window.setTimeout(() => {
        ensureVisible();
        element.removeEventListener('animationend', handleAnimationEnd);
        clearLabElementTimeouts(element);
      }, delay + LAB_ANIMATION_DURATION_MS + 100);

      const startTimeout = window.setTimeout(() => {
        element.classList.add(LAB_CLASS);
      }, delay);

      element.addEventListener('animationend', handleAnimationEnd);
      element.dataset.labTransitionTimeouts = `${startTimeout},${fallbackTimeout}`;
    });
  }, LAB_PREP_DELAY_MS);
};

type TransitionCleanupScope = 'project' | 'laboratory' | 'all';

const PROJECT_CLEANUP_SELECTOR = '[data-project-transition], [data-project-card]';
const LAB_CLEANUP_SELECTOR =
  '[data-lab-header], [data-lab-toolbar], [data-lab-sidebar], [data-lab-canvas], [data-lab-settings]';

export const cleanupProjectTransition = (scope: TransitionCleanupScope = 'all') => {
  if (typeof document === 'undefined') {
    return;
  }

  const selectors: string[] = [];

  if (scope === 'project' || scope === 'all') {
    selectors.push(PROJECT_CLEANUP_SELECTOR);
  }

  if (scope === 'laboratory' || scope === 'all') {
    selectors.push(LAB_CLEANUP_SELECTOR);
  }

  if (!selectors.length) {
    return;
  }

  const allElements = document.querySelectorAll(selectors.join(', '));

  allElements.forEach((element) => {
    const target = element as HTMLElement;
    target.classList.remove(EXIT_CLASS, LAB_CLASS);
    target.style.opacity = '';
    target.style.transform = '';
    target.style.removeProperty('--project-exit-delay');
    target.style.removeProperty('--lab-enter-delay');
    target.style.willChange = '';
    clearLabElementTimeouts(target);
  });
};
