# Resource Pool

An easy to use resource pool, including support for recycling resources, with excellent TypeScript typings.

## Installation

```sh
npm install --save ts-resource-pool
```

## Usage

A simplified example of writing a connection pooling mail client:

```js
const net = require('net')
const ResourcePool = require('ts-resource-pool')

const factory = {
  async create () {
    const connection = net.createConnection(25, 'aspmx.l.google.com')
    connection.write('HELO LinusU.local\r\n')
    return connection
  },
  async recycle (connection, error) {
    // Create a new connection if an error happened
    if (error) {
      await this.destroy(connection)
      return this.create()
    }

    // Otherwise, just issue a `RSET` command and reuse the connection
    connection.write('RSET\r\n')
    return connection
  },
  async destory (connection) {
    connection.write('QUIT\r\n')
    connection.end()
  }
}

const pool = new ResourcePool(factory, 5)

for (let i = 0; i < 25; i++) {
  pool.use(async (connection) => {
    connection.write('MAIL FROM: <linus@LinusU.local>\r\n')
    connection.write('RCPT TO: <spam@gmail.com>\r\n')
  })
}
```

The `ResourcePool` will make sure that there is never more than 5 connections open at the same time, and it will also reuse the connections instead of closing and opening new sockets.

## API

### `new ResourcePool(factory: Factory, concurrency: number = 1)`

Create a new `ResourcePool` with the specificed factory and concurrency limit.

The `factory` must at the very least provide a `create` function, which returns a fresh resource. This can optionally be an async function.

It can also optionally provide:

- A `destroy` function, that takes a used resource and an optional error that occured, and tears it down.
- A `recycle` function, that takes a used resource and an optional error that occured, and returns a resource (possibly the same) that's ready for use again.

### `ResourcePool#use (fn: (resource: T) => R | PromiseLike<R>): Promise<R>`

Aquire a resource, then execute (possibly async) function `fn`, and finally returns the resource to the pool. Returns a `Promise` of whatever the function `fn` returns.

The resource will be returned even if `fn` throws or returns a rejected `Promise`. In this case, the `Promise` returned will also be rejected with that error.
