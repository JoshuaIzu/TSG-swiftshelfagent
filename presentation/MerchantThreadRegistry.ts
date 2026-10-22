export interface ChatThreadRef {
  readonly threadId: string;
  readonly sessionId?: string;
}

const registry = new Map<string, ChatThreadRef>();

export const registerMerchantThread = (merchantId: string, ref: ChatThreadRef): void => {
  registry.set(merchantId, ref);
};

export const lookupMerchantThread = (merchantId: string): ChatThreadRef | undefined => {
  return registry.get(merchantId);
};