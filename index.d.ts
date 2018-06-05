declare interface ResourceFactory<T> {
  create (): T | PromiseLike<T>
  recycle? (resource: T, error: null | Error): T | PromiseLike<T>
  destroy? (resource: T, error: null | Error): void | PromiseLike<void>
}

declare class ResourcePool<T> {
  constructor (factory: ResourceFactory<T>, concurrency?: number)
  use<R> (fn: (resource: T) => R | PromiseLike<R>): Promise<R>
}

export = ResourcePool
