# @lickle/streamkit

Minimal service coordination system with event-driven architecture and reactive streams.

[![Build Status](https://img.shields.io/github/actions/workflow/status/Pingid/lickle-streamkit/test.yml?branch=main&style=flat&colorA=000000&colorB=000000)](https://github.com/Pingid/lickle-streamkit/actions?query=workflow:Test)
[![Build Size](https://img.shields.io/bundlephobia/minzip/@lickle/streamkit?label=bundle%20size&style=flat&colorA=000000&colorB=000000)](https://bundlephobia.com/result?p=@lickle/streamkit)
[![Version](https://img.shields.io/npm/v/@lickle/streamkit?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@lickle/streamkit)
[![Downloads](https://img.shields.io/npm/dt/@lickle/streamkit.svg?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@lickle/streamkit)

## Install

```bash
npm install @lickle/streamkit
```

---

## Quick Start

```ts
import { createRegistry } from '@lickle/streamkit'

// Define event types
type Events = {
  'user.created': { id: string; name: string }
  'user.deleted': { id: string }
}

type Context = { db: Database }

// Create registry and register services
const registry = createRegistry<Events, Context>()
registry.register(userService)
registry.register(loggingService)

// Start system with context
const system = registry.start({ db: myDatabase })

// Emit events
system.emit('user.created', { id: '123', name: 'Alice' })

// Clean up
system.stop()
```

---

## Core Concepts

### Events

Events are typed messages that flow through the system. Services emit events and observe events from other services.

```ts
type EventMap = {
  'data.updated': { id: string; value: number }
  'task.completed': { taskId: string }
}
```

### Services

Services are self-contained units that communicate through events. Services can observe events, emit events, expose APIs, and depend on other services.

```ts
import { Service, on, toEvent } from '@lickle/streamkit'
import { map } from '@lickle/rx'
import { pipe } from '@lickle/rx/util'

const userService: Service<
  Events,
  Context,
  { name: 'users'; outbound: 'user.created' | 'user.deleted' }
> = {
  name: 'users',
  observer: pipe(
    on('user.created'),
    map((user) => {
      console.log('User created:', user)
      return toEvent('user.created')(user)
    }),
  ),
}
```

### System

The system manages service lifecycle and coordinates event flow. It provides a shared event bus and context.

```ts
const system = createSystem<Events, Context>({ db: myDatabase })

// Register services
system.register(userService)
system.register(loggingService)

// Subscribe to all events
system.events((event) => {
  console.log(event.type, event.data)
})
```

---

## Service Definition

Services specify their event subscriptions, emissions, and dependencies through a type definition:

```ts
type ServiceDef = {
  name: 'my-service'
  inbound: 'user.created' // Events this service observes
  outbound: 'email.sent' // Events this service emits
  dependencies: { name: 'mailer'; api: MailerAPI } // Services this depends on
}
```

### Service Runtime

Services receive a runtime environment with typed access to events and dependencies:

```ts
const emailService: Service<
  Events,
  Context,
  {
    name: 'email'
    inbound: 'user.created'
    outbound: 'email.sent'
    dependencies: { name: 'mailer'; api: MailerAPI }
  }
> = {
  name: 'email',
  observer: pipe(
    on('user.created'),
    map((user) => {
      // Access dependency
      const mailer = runtime.service('mailer')
      mailer.send(user.email, 'Welcome!')

      return toEvent('email.sent')({ userId: user.id })
    }),
  ),
}
```

---

## Service APIs

Services can expose APIs for direct service-to-service interaction:

```ts
type LoggerAPI = {
  log: (message: string) => void
}

const logger: Service<Events, Context, { name: 'logger' }, LoggerAPI> = {
  name: 'logger',
  api: {
    log: (message) => console.log(message),
  },
}

// Other services can access the API
const otherService: Service<
  Events,
  Context,
  { name: 'other'; dependencies: { name: 'logger'; api: LoggerAPI } }
> = {
  name: 'other',
  run: (runtime) => {
    const logger = runtime.service('logger')
    logger.log('Hello from other service')
  },
}
```

---

## Registry Pattern

Use the registry pattern to define services before system initialization:

```ts
import { createRegistry } from '@lickle/streamkit'

const registry = createRegistry<Events, Context>()

// Register services in order
registry.register(coreService)
registry.register(dataService)
registry.register(uiService)

// Start with context
const system = registry.start({ db, config })

// Stop all services
system.stop()
```

---

## Helpers

### toEvent

Creates an event object from type and data:

```ts
const emit = toEvent('user.created')
return emit({ id: '123', name: 'Alice' })
```

### on

Observes a specific event type in reactive service definitions:

```ts
observer: pipe(
  on('user.created'),
  map((user) => console.log('User:', user)),
)
```

---

## License

MIT © [Dan Beaven](https://github.com/Pingid)
