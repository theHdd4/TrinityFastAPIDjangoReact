const controllers = new Map<string, AbortController>();

export const registerPrefillController = (atomId: string, controller: AbortController) => {
  controllers.set(atomId, controller);
};

export const cancelPrefillController = (atomId: string) => {
  const controller = controllers.get(atomId);
  if (controller) {
    controller.abort();
    controllers.delete(atomId);
  }
};
