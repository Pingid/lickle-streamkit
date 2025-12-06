import { flow, switchMap, map, merge, pipe } from '@lickle/rx'
import {
  type ServiceDefinition,
  type Service,
  type Name,
  type Inbound,
  type Outbound,
  type Dependencies,
  on,
  ServiceDependency,
  toEvent,
} from '../src/index.js'

type UserEvents = {
  'user.created': User
  'user.updated': User
  'user.deleted': User
  'user.update-count': number
}

type User = { id: string; email: string; name: string; age: number }

type ServiceContext = { sendEmail: (email: string) => void }

type UserService<S extends ServiceDefinition<UserEvents>, A = undefined> = Service<UserEvents, ServiceContext, S, A>

type In<E extends keyof UserEvents> = Inbound<UserEvents, E>
// @ts-ignore
type Out<E extends keyof UserEvents> = Outbound<UserEvents, E>
// @ts-ignore
type Deps<S extends ServiceDependency> = Dependencies<S>

type LatestUser = UserService<Name<'user:latest'> & In<keyof UserEvents>, { lastCreated: () => User | null }>

export const createLatestUserService = (): LatestUser => {
  let lastCreated: User | null = null
  return {
    name: 'user:latest',
    api: { lastCreated: () => lastCreated },
    run: (r) => {
      const $created = pipe(
        r.observe('user.created'),
        map((user) => {
          lastCreated = user
        }),
      )

      const $deleted = pipe(
        r.observe('user.deleted'),
        map((user) => {
          if (user.id === lastCreated?.id) lastCreated = null
        }),
      )

      return merge($created, $deleted)
    },
  }
}

type EmailOnUserDeleted = UserService<{
  name: 'user:email-on-deleted'
  inbound: 'user.deleted'
  dependencies: LatestUser
}>

export const EmailOnUserDeletedService: EmailOnUserDeleted = {
  name: 'user:email-on-deleted',
  observer: flow(
    switchMap((service) => {
      return pipe(
        service.observe('user.deleted'),
        map((user) => {
          service.context.sendEmail(user.email)
        }),
      )
    }),
  ),
}

type UserUpdates = UserService<{
  name: 'user:updates'
  inbound: 'user.updated'
  outbound: 'user.update-count'
}>

export const createUserUpdatesService = (): UserUpdates => {
  let count = 0
  return {
    name: 'user:updates',
    observer: flow(
      on('user.updated'),
      map((_user) => count++),
      map(toEvent('user.update-count')),
    ),
  }
}
