import { Effect, Context, Layer, PubSub, Queue, Scope } from "effect";

// Importing the DomainEvent union from a central types files
import { DomainEvent } from "./events";

export function assertNever(value: never): never {
   throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}

export interface EventBusService {
   readonly bus: PubSub.PubSub<DomainEvent>;
   readonly publish: (event: DomainEvent) => Effect.Effect<boolean>;
   readonly subscribe: Effect.Effect<Queue.Dequeue<DomainEvent>, never, Scope.Scope>;
}

export const EventBusService = Context.GenericTag<EventBusService>("@swiftshelf/EventBusService");

export const EventBusLive  = Layer.effect(
    EventBusService,
    Effect.gen(function* () {
       //yield required by effect.TS
       const bus = yield* PubSub.unbounded<DomainEvent>();

       return {
          bus,
          publish: (event: DomainEvent) => PubSub.publish(bus, event),
          subscribe: PubSub.subscribe(bus),
       };
    })
);