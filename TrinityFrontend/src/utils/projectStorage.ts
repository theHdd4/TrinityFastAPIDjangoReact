import { safeStringify } from './safeStringify';

function stripCards(cards: any[]): any[] {
  return cards.map(card => ({
    ...card,
    atoms: card.atoms.map((atom: any) => {
      if (atom.type === 'dataframe-operations' && atom.settings) {
        const { tableData, data, ...rest } = atom.settings;
        return { ...atom, settings: rest };
      }
      return atom;
    }),
  }));
}

export function sanitizeLabConfig(config: any): any {
  const clone = JSON.parse(JSON.stringify(config || {}));
  if (Array.isArray(clone.cards)) {
    clone.cards = stripCards(clone.cards);
  }
  return clone;
}

// Remove large in-memory data before persisting project to localStorage
export function serializeProject(project: any): string {
  const clone = JSON.parse(JSON.stringify(project));
  const cards = clone?.state?.laboratory_config?.cards;
  if (Array.isArray(cards)) {
    clone.state.laboratory_config.cards = stripCards(cards);
  }
  return safeStringify(clone);
}

export { stripCards as sanitizeCards };
