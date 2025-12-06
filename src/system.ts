import type { Observable, Unsubscribe } from '@lickle/rx'

import type { ContextMap, EventMap, Service, ServiceEvent, InboundEvents } from './definition.js'

/**
 * Runtime system that manages service coordination through event-driven architecture.
 *
 * Provides a shared event bus for inter-service communication and manages service
 * lifecycle. Services can emit events, observe events from other services, and
 * expose APIs for direct service-to-service interaction.
 */
export type System<E extends EventMap, C extends ContextMap> = {
  /**
   * Shared context available to all registered services.
   * Contains configuration, external dependencies, and system-wide state.
   */
  context: C

  /**
   * Observable stream of all events emitted within the system.
   * Services can subscribe to this stream and filter for specific event types.
   */
  events: Observable<ServiceEvent<E, keyof E>>

  /**
   * Emits an event to the system event bus.
   * All registered services observing this event type will receive the event.
   */
  emit<K extends keyof E>(type: K, data: E[K]): void

  /**
   * Registers a service with the system.
   * The service will be connected to the event bus and its API (if provided)
   * will be made available to other services. Returns an unsubscribe function.
   */
  register<S extends Service<E, C, any>>(service: S): Unsubscribe
}

/**
 * Internal service bus interface provided to services for system interaction.
 * Combines event observation capabilities with service discovery.
 */
export type ServiceBus<E extends EventMap> = InboundEvents<E> & {
  /**
   * Looks up a registered service by name and returns its API.
   * Throws an error if the service is not found.
   */
  service: (name: string) => Record<string, any>
}

/**
 * Creates a new system instance for managing services.
 *
 * The system acts as a centralized coordinator for services, providing:
 * - A shared event bus for asynchronous communication between services
 * - Service registration and lifecycle management
 * - Access to shared context and dependencies
 * - Service discovery through registered APIs
 *
 * @example
 * ```typescript
 * // Define your event types
 * type AppEvents = {
 *   dataUpdated: { id: string; value: number }
 *   taskCompleted: { taskId: string }
 * }
 *
 * // Create system with shared context
 * const system = createSystem<AppEvents, { db: Database }>({
 *   db: myDatabase
 * })
 *
 * // Register services - they can emit and observe events
 * system.register(dataService)
 * system.register(taskService)
 *
 * // Emit events directly if needed
 * system.emit('dataUpdated', { id: '123', value: 42 })
 * ```
 */
export const createSystem = <E extends EventMap, C extends ContextMap>(context: C): System<E, C> => {
  type AnyEvent = ServiceEvent<E, keyof E>

  const subscribers: Array<(event: AnyEvent) => void> = []
  const apis = new Map<string, Record<string, any>>()

  // Public API
  const events = createEventObservable(subscribers)
  const emit = createEventEmitter<E>(subscribers)
  const register = createServiceRegistrar<E, C>(context, apis, events, emit)

  return { context, events, emit, register }
}

// Domain logic - service registration
const createServiceRegistrar = <E extends EventMap, C extends ContextMap>(
  context: C,
  apis: Map<string, Record<string, any>>,
  events: Observable<ServiceEvent<E, keyof E>>,
  emit: <K extends keyof E>(type: K, data: E[K]) => void,
) => {
  return <S extends Service<E, C, any>>(service: S): Unsubscribe => {
    // Register API if provided
    if ('api' in service && service.api) {
      apis.set(service.name as string, service.api as Record<string, any>)
    }

    // Set up service observer
    const unsubscribeOutput = service.observer ? connectServiceObserver(service, context, apis, events, emit) : () => {}

    // Return cleanup function
    return () => {
      unsubscribeOutput()
      if ('api' in service && service.api) {
        apis.delete(service.name as string)
      }
    }
  }
}

// Domain logic - connect service observer to system
const connectServiceObserver = <E extends EventMap, C extends ContextMap, S extends Service<E, C, any>>(
  service: S,
  context: C,
  apis: Map<string, Record<string, any>>,
  events: Observable<ServiceEvent<E, keyof E>>,
  emit: <K extends keyof E>(type: K, data: E[K]) => void,
): Unsubscribe => {
  const bus = createServiceBus<E, C>(context, apis, events)
  const bus$ = createSingleEmitObservable(bus)

  // Type assertion needed due to complex service runtime type mapping
  const output$ = service.observer!(bus$ as any)

  if (!output$) return () => {}

  return output$((event: unknown) => {
    if (!event) return
    const { type, data } = event as ServiceEvent<E, keyof E>
    emit(type, data)
  })
}

// Utility - create service bus for a service
const createServiceBus = <E extends EventMap, C extends ContextMap>(
  context: C,
  apis: Map<string, Record<string, any>>,
  events: Observable<ServiceEvent<E, keyof E>>,
) => ({
  context,
  observe: createFilteredObservable<E>(events),
  service: createServiceLookup(apis),
})

// Utility - create filtered observable for specific event types
const createFilteredObservable =
  <E extends EventMap>(events: Observable<ServiceEvent<E, keyof E>>) =>
  <K extends keyof E>(type: K): Observable<E[K]> =>
  (subscriber: (data: E[K]) => void) =>
    events((event: ServiceEvent<E, keyof E>) => {
      if (event.type === type) {
        subscriber(event.data as E[K])
      }
    })

// Utility - create service lookup function
const createServiceLookup = (apis: Map<string, Record<string, any>>) => (name: string) => {
  const api = apis.get(name)
  if (!api) {
    throw new Error(`Service dependency not found: ${name}`)
  }
  return api
}

// Utility - create observable that emits once
const createSingleEmitObservable =
  <T>(value: T): Observable<T> =>
  (subscriber: (value: T) => void) => {
    subscriber(value)
    return () => {}
  }

// Utility - create event observable
const createEventObservable =
  <E extends EventMap>(
    subscribers: Array<(event: ServiceEvent<E, keyof E>) => void>,
  ): Observable<ServiceEvent<E, keyof E>> =>
  (subscriber: (event: ServiceEvent<E, keyof E>) => void) => {
    subscribers.push(subscriber)
    return createUnsubscribe(subscribers, subscriber)
  }

// Utility - create event emitter
const createEventEmitter =
  <E extends EventMap>(subscribers: Array<(event: ServiceEvent<E, keyof E>) => void>) =>
  <K extends keyof E>(type: K, data: E[K]) => {
    const event = { type, data } as ServiceEvent<E, keyof E>
    // Copy to avoid mutation during emit
    for (const listener of [...subscribers]) {
      listener(event)
    }
  }

// Primitive - create unsubscribe function
const createUnsubscribe = <T>(list: T[], item: T): Unsubscribe => {
  let active = true
  return () => {
    if (!active) return
    active = false
    const index = list.indexOf(item)
    if (index >= 0) list.splice(index, 1)
  }
}
