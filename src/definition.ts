import type { Observable } from '@lickle/rx'
import { switchMap } from '@lickle/rx'

/**
 * Map of event types and their payloads.
 * Keys are event names, values are the data shape for each event.
 */
export type EventMap = Record<string, unknown>

/**
 * Map of shared context properties available to all services.
 * Typically contains configuration, dependencies, or shared resources.
 */
export type ContextMap = Record<string, unknown>

/**
 * Structure of an event in the system.
 * Contains the event type and its associated data.
 */
export type ServiceEvent<E extends EventMap, K extends keyof E> = { type: K; data: E[K] }

/**
 * Describes a service that can be injected as a dependency.
 */
export type ServiceDependency = { name: string; api: Record<string, any> }

/**
 * Metadata specification for a service.
 * Defines the service's name, event subscriptions, emissions, and dependencies.
 * This type is primarily used as a generic parameter for the Service type.
 */
export type ServiceDefinition<E extends EventMap> = {
  /** Unique identifier for the service */
  name: string
  /** Event types this service can observe */
  inbound?: keyof E | undefined
  /** Event types this service can emit */
  outbound?: keyof E | undefined
  /** Other services this service depends on */
  dependencies?: ServiceDependency | undefined
  /** API exposed by this service to other services */
  api?: Record<string, any> | undefined
}

/**
 * Runtime environment provided to a service's run function.
 * Contains context, event observation methods, and dependency access
 * based on the service's definition.
 */
export type ServiceRuntime<E extends EventMap, S extends ServiceDefinition<E>, C extends ContextMap> = {
  $events: E
} & ServiceRuntimeInbound<E, S> &
  ServiceRuntimeDependency<E, S> & { context: C }

type ServiceRuntimeInbound<E extends EventMap, S extends ServiceDefinition<E>> = S['inbound'] extends keyof E
  ? InboundEvents<E, S['inbound']>
  : {}

/**
 * Interface for observing events within a service.
 * Provided to services that specify inbound events in their definition.
 */
export type InboundEvents<E extends EventMap, EK extends keyof E = keyof E> = {
  observe: <K extends EK>(type: K) => Observable<E[K]>
}

type ServiceRuntimeDependency<
  E extends EventMap,
  S extends ServiceDefinition<E>,
> = S['dependencies'] extends ServiceDependency ? DependencyAccess<S['dependencies']> : {}

/**
 * Interface for accessing service dependencies.
 * Provided to services that specify dependencies in their definition.
 */
export type DependencyAccess<S extends ServiceDependency> = {
  service: <N extends S['name']>(name: N) => Extract<S, { name: N }>['api']
}

/**
 * Defines a service that can be registered with the system.
 *
 * Services can implement either `observer` for reactive stream-based logic
 * or `run` for simpler imperative logic. The service definition (S) determines
 * what events can be observed/emitted and what dependencies are available.
 *
 * @example
 * ```typescript
 * const myService: Service<Events, Context, { name: 'my-service'; outbound: 'data.updated' }> = {
 *   name: 'my-service',
 *   observer: flow(
 *     map(bus => toEvent('data.updated')({ value: 42 }))
 *   )
 * }
 * ```
 */
export type Service<E extends EventMap, C extends ContextMap, S extends ServiceDefinition<E>, A = undefined> = {
  name: S['name']
  /** Stream-based service logic. Receives an observable of the runtime environment. */
  observer?: (observable: Observable<ServiceRuntime<E, S, C>>) => Observable<ServiceEventFor<E, S['outbound']>>
  /** Imperative service logic. Receives the runtime environment directly. */
  run?: (runtime: ServiceRuntime<E, S, C>) => Observable<ServiceEventFor<E, S['outbound']>> | void
} & (A extends Record<string, any> ? { api: A } : {})

type ServiceEventFor<E extends EventMap, K> = K extends keyof E ? ServiceEvent<E, K> : void

/**
 * Helper types for building service definitions.
 * These can be combined with & to create complete service definitions.
 */
export type Name<S extends string> = { name: S }
export type Inbound<E extends EventMap, K extends keyof E> = { inbound: K }
export type Outbound<E extends EventMap, K extends keyof E> = { outbound: K }
export type Dependencies<S extends ServiceDependency> = { dependencies: S }

/**
 * Creates an event object from a type and data.
 * Useful for emitting events in service logic.
 *
 * @example
 * ```typescript
 * const emit = toEvent('user.created')
 * return emit({ id: '123', name: 'Alice' })
 * ```
 */
export const toEvent =
  <K extends string>(type: K) =>
  <V>(data: V): { type: K; data: V } => ({ type, data })

/**
 * Operator that observes a specific event type from the service bus.
 * Useful in reactive service definitions with flow/pipe.
 *
 * @example
 * ```typescript
 * observer: flow(
 *   on('user.created'),
 *   map(user => console.log('User created:', user))
 * )
 * ```
 */
export const on =
  <K extends string>(type: K) =>
  <P>(source: Observable<{ observe: (type: K) => Observable<P> }>): Observable<P> =>
    switchMap((bus: { observe: (type: K) => Observable<P> }) => bus.observe(type))(source)
