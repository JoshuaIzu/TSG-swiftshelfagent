// src/core/events.ts
import type { InventoryEvent } from "../inventory/types";
import type { WalletEvent } from "../wallet/types";
import type { DispatchEvent } from "../dispatch/types";

export type DomainEvent = InventoryEvent | WalletEvent | DispatchEvent;