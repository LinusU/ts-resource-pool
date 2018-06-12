/* eslint-env mocha */

const assert = require('assert')
const assertRejects = require('assert-rejects')
const pSleep = require('p-sleep')

const ResourcePool = require('./')

describe('ts-resource-pool', () => {
  it('gives access to a resource', () => {
    const events = []
    const resource = Symbol('resource')

    const create = () => { events.push('create'); return resource }
    const pool = new ResourcePool({ create })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a') })

    return a.then(() => {
      assert.deepStrictEqual(events, ['create', 'a'])
    })
  })

  it('destroys resources', () => {
    const events = []
    const resource = Symbol('resource')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('destroy') }
    const pool = new ResourcePool({ create, destroy })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a') })

    return a.then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'destroy'])
    }).then(() => {
      return pool.use((r) => { assert.strictEqual(r, resource); events.push('b') })
    }).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'destroy', 'create', 'b', 'destroy'])
    })
  })

  it('recycles resources', () => {
    const events = []
    const resource = Symbol('resource')
    const recycled = Symbol('recycled')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, recycled); assert.strictEqual(e, null); events.push('destroy') }
    const recycle = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('recycle'); return recycled }
    const pool = new ResourcePool({ create, destroy, recycle })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a') })
    const b = pool.use((r) => { assert.strictEqual(r, recycled); events.push('b') })

    return Promise.all([a, b]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'recycle', 'b', 'destroy'])
    })
  })

  it('works without recycle function', () => {
    const events = []
    const resource = Symbol('resource')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('destroy') }
    const pool = new ResourcePool({ create, destroy })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a') })
    const b = pool.use((r) => { assert.strictEqual(r, resource); events.push('b') })
    const c = pool.use((r) => { assert.strictEqual(r, resource); events.push('c') })

    return Promise.all([a, b, c]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'b', 'c', 'destroy'])
    })
  })

  it('propagate create errors', () => {
    const events = []

    const create = () => { events.push('create'); throw new Error('8M6IYK5TGS') }
    const pool = new ResourcePool({ create })

    const a = pool.use(() => { events.push('a') })

    const ar = assertRejects(a, (err) => (err.message === '8M6IYK5TGS'))

    return Promise.all([ar]).then(() => {
      assert.deepStrictEqual(events, ['create'])
    })
  })

  it('propagate destroy errors', () => {
    const events = []
    const resource = Symbol('resource')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('destroy'); throw new Error('A4TN6NEH7C') }
    const pool = new ResourcePool({ create, destroy })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a') })

    const ar = assertRejects(a, (err) => (err.message === 'A4TN6NEH7C'))

    return Promise.all([ar]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'destroy'])
    })
  })

  it('propagate resuse errors', () => {
    const events = []
    const resource = Symbol('resource')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('destroy') }
    const recycle = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('recycle'); throw new Error('7DLIYZHUDI') }
    const pool = new ResourcePool({ create, destroy, recycle })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a') })
    const b = pool.use((r) => { assert.strictEqual(r, resource); events.push('b') })

    const br = assertRejects(b, (err) => (err.message === '7DLIYZHUDI'))

    return Promise.all([a, br]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'recycle'])
    })
  })

  it('limits concurrency', function () {
    this.slow(450)

    const events = []
    const resources = [Symbol('resource-1'), Symbol('resource-2')]
    const resourcesIterator = resources[Symbol.iterator]()

    const create = () => { events.push('create'); return resourcesIterator.next().value }
    const destroy = (r, e) => { assert.ok(resources.includes(r)); assert.strictEqual(e, null); events.push('destroy') }
    const recycle = (r, e) => { assert.ok(resources.includes(r)); assert.strictEqual(e, null); events.push('recycle'); return r }
    const pool = new ResourcePool({ create, destroy, recycle }, 2)

    const a = pool.use((r) => { assert.strictEqual(r, resources[0]); events.push('a-start'); return pSleep(10).then(() => { events.push('a-end') }) })
    const b = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('b-start'); return pSleep(20).then(() => { events.push('b-end') }) })
    const c = pool.use((r) => { assert.strictEqual(r, resources[0]); events.push('c-start'); return pSleep(40).then(() => { events.push('c-end') }) })
    const d = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('d-start'); return pSleep(80).then(() => { events.push('d-end') }) })
    const e = pool.use((r) => { assert.strictEqual(r, resources[0]); events.push('e-start'); return pSleep(160).then(() => { events.push('e-end') }) })
    const f = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('f-start'); return pSleep(320).then(() => { events.push('f-end') }) })

    return Promise.all([a, b, c, d, e, f]).then(() => {
      assert.deepStrictEqual(events, [
        'create',
        'create',
        'a-start',
        'b-start',
        'a-end',
        'recycle',
        'c-start',
        'b-end',
        'recycle',
        'd-start',
        'c-end',
        'recycle',
        'e-start',
        'd-end',
        'recycle',
        'f-start',
        'e-end',
        'destroy',
        'f-end',
        'destroy'
      ])
    })
  })

  it('picks first available resource', () => {
    const events = []
    const resources = [Symbol('resource-1'), Symbol('resource-2')]
    const resourcesIterator = resources[Symbol.iterator]()

    const create = () => { events.push('create'); return resourcesIterator.next().value }
    const destroy = (r, e) => { assert.ok(resources.includes(r)); assert.strictEqual(e, null); events.push('destroy') }
    const recycle = (r, e) => { assert.ok(resources.includes(r)); assert.strictEqual(e, null); events.push('recycle'); return r }
    const pool = new ResourcePool({ create, destroy, recycle }, 2)

    const a = pool.use((r) => { assert.strictEqual(r, resources[0]); events.push('a-start'); return pSleep(50).then(() => { events.push('a-end') }) })
    const b = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('b-start'); return pSleep(5).then(() => { events.push('b-end') }) })
    const c = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('c-start'); return pSleep(5).then(() => { events.push('c-end') }) })
    const d = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('d-start'); return pSleep(5).then(() => { events.push('d-end') }) })
    const e = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('e-start'); return pSleep(5).then(() => { events.push('e-end') }) })
    const f = pool.use((r) => { assert.strictEqual(r, resources[1]); events.push('f-start'); return pSleep(5).then(() => { events.push('f-end') }) })

    return Promise.all([a, b, c, d, e, f]).then(() => {
      assert.deepStrictEqual(events, [
        'create',
        'create',
        'a-start',
        'b-start',
        'b-end',
        'recycle',
        'c-start',
        'c-end',
        'recycle',
        'd-start',
        'd-end',
        'recycle',
        'e-start',
        'e-end',
        'recycle',
        'f-start',
        'f-end',
        'destroy',
        'a-end',
        'destroy'
      ])
    })
  })

  it('reveals error to destroy', () => {
    const events = []
    const resource = Symbol('resource')
    const error = new Error('YDKETMFVES')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, error); events.push('destroy') }
    const pool = new ResourcePool({ create, destroy })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a'); throw error })

    const ar = assertRejects(a, (err) => (err.message === 'YDKETMFVES'))

    return Promise.all([ar]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'destroy'])
    })
  })

  it('reveals error to recycle', () => {
    const events = []
    const resource = Symbol('resource')
    const error = new Error('YDKETMFVES')

    const create = () => { events.push('create'); return resource }
    const destroy = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('destroy') }
    const recycle = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, error); events.push('recycle'); return r }
    const pool = new ResourcePool({ create, destroy, recycle })

    const a = pool.use((r) => { assert.strictEqual(r, resource); events.push('a'); throw error })
    const b = pool.use((r) => { assert.strictEqual(r, resource); events.push('b') })

    const ar = assertRejects(a, (err) => (err.message === 'YDKETMFVES'))

    return Promise.all([ar, b]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'recycle', 'b', 'destroy'])
    })
  })

  it('properly cleans up after failed creation', () => {
    const events = []
    const error = new Error('YDKETMFVES')

    const create = () => { events.push('create'); throw error }
    const pool = new ResourcePool({ create })

    const a = pool.use(() => {})
    const b = pool.use(() => {})

    const ar = assertRejects(a, (err) => (err.message === 'YDKETMFVES'))
    const br = assertRejects(b, (err) => (err.message === 'YDKETMFVES'))

    return Promise.all([ar, br]).then(() => {
      assert.deepStrictEqual(events, ['create', 'create'])
    })
  })

  it('properly cleans up after failed recycle', () => {
    const events = []
    const resource = Symbol('resource')
    const error = new Error('YDKETMFVES')

    const create = () => { events.push('create'); return resource }
    const recycle = (r, e) => { assert.strictEqual(r, resource); assert.strictEqual(e, null); events.push('recycle'); throw error }
    const pool = new ResourcePool({ create, recycle })

    const a = pool.use(() => { events.push('a') })
    const b = pool.use(() => { events.push('b') })
    const c = pool.use(() => { events.push('c') })
    const d = pool.use(() => { events.push('d') })

    const br = assertRejects(b, (err) => (err.message === 'YDKETMFVES'))
    const dr = assertRejects(d, (err) => (err.message === 'YDKETMFVES'))

    return Promise.all([a, br, c, dr]).then(() => {
      assert.deepStrictEqual(events, ['create', 'a', 'recycle', 'create', 'c', 'recycle'])
    })
  })
})
