import type { Unsubscribe } from '@lickle/rx'

import type { ContextMap, EventMap, Service } from './definition.js'
import { createSystem, System } from './system.js'

/**
 * Running system with lifecycle management.
 * Extends the base System with a stop method for cleanup.
 */
export type RunningSystem<E extends EventMap, C extends ContextMap> = System<E, C> & {
  /**
   * Stops the system and cleans up all registered services.
   * After calling stop, the system should not be used.
   */
  stop(): void
}

/**
 * Registry holds service definitions before system initialization.
 * Services are registered first, then the system is started with context.
 */
export type ServiceRegistry<E extends EventMap, C extends ContextMap> = {
  /**
   * Registers a service to be started when the system starts.
   * Services are started in registration order.
   */
  register<S extends Service<E, C, any>>(service: S): void

  /**
   * Starts the system with the provided context.
   * All registered services are initialized and connected to the event bus.
   */
  start(context: C): RunningSystem<E, C>
}

/**
 * Creates a new service registry for building systems.
 *
 * @example
 * ```typescript
 * const registry = createRegistry<DemoEvents, DemoCtx>()
 *
 * registry.register(serviceA)
 * registry.register(serviceB)
 *
 * const system = registry.start({ db: myDatabase })
 *
 * const unsub = system.events((evt) => {
 *   console.log('Event:', evt.type, evt.data)
 * })
 *
 * system.emit('user.created', { id: '123', name: 'Alice' })
 *
 * // Clean up when done
 * unsub()
 * system.stop()
 * ```
 */
export const createRegistry = <E extends EventMap, C extends ContextMap>(): ServiceRegistry<E, C> => {
  const services: Service<E, C, any>[] = []

  const register = <S extends Service<E, C, any>>(service: S): void => {
    services.push(service)
  }

  const start = (context: C): RunningSystem<E, C> => {
    const system = createSystem<E, C>(context)
    const unsubscribers: Unsubscribe[] = []

    // Register all services and track unsubscribe functions
    for (const service of services) {
      const unsubscribe = system.register(service)
      unsubscribers.push(unsubscribe)
    }

    // Create enhanced system with stop method
    const stop = () => {
      // Unregister all services in reverse order
      for (let i = unsubscribers.length - 1; i >= 0; i--) {
        const unsub = unsubscribers[i]
        if (unsub) unsub()
      }
      unsubscribers.length = 0
    }

    return { ...system, stop }
  }

  return { register, start }
}
