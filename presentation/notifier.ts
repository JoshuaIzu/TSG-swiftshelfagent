import { Effect, Queue } from "effect";
import { EventBusService } from "../core/EventBus";
import { ChordClient } from "../chord/client";
import type { ChordTurnRequest } from "../chord/types";
import type { DomainEvent } from "../core/events";
import { renderWhatsAppMessage } from "./renderer";
import { lookupMerchantThread } from "./MerchantThreadRegistry";

const chordClient = new ChordClient();

const deliverEvent = (event: DomainEvent) =>
  Effect.gen(function* () {
    const thread = lookupMerchantThread(event.merchantId);
    if (!thread) {
      yield* Effect.logWarning(`[Notifier] No chat thread registered for ${event.merchantId}; dropped ${event.type}`);
      return;
    }
    const request: ChordTurnRequest = {
      thread_id: thread.threadId,
      session_id: thread.sessionId,
      message: renderWhatsAppMessage(event),
    };
    yield* Effect.tryPromise({
      try: () => chordClient.sendTurn(request),
      catch: (cause) => cause,
    }).pipe(
      Effect.match({
        onFailure: () => Effect.logError(`[Notifier] Failed to deliver ${event.type} to ${thread.threadId}`),
        onSuccess: () => Effect.logInfo(`[Notifier] Delivered ${event.type} to ${thread.threadId}`),
      })
    );
  });

export const whatsappNotifierLoop = Effect.scoped(
  Effect.gen(function* () {
    const eventBus = yield* EventBusService;
    const subscription = yield* eventBus.subscribe;
    yield* Effect.logInfo("[Notifier] WhatsApp event pump started");
    while (true) {
      const event = yield* Queue.take(subscription);
      yield* deliverEvent(event);
    }
  })
);
