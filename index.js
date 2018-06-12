const pTry = require('p-try')

const kAquire = Symbol('aquire')
const kFactory = Symbol('factory')
const kLimit = Symbol('limit')
const kQueue = Symbol('queue')
const kRelease = Symbol('release')
const kRevert = Symbol('revert')
const kUsed = Symbol('used')

class ResourcePool {
  constructor (factory, concurrency = 1) {
    if (concurrency < 1) {
      throw new Error('concurrency cannot be less than 1')
    }

    this[kFactory] = factory
    this[kLimit] = concurrency
    this[kQueue] = []
    this[kUsed] = 0
  }

  [kRevert] (err) {
    this[kUsed] -= 1

    if (this[kQueue].length) {
      this[kQueue].shift()(this[kAquire]())
    }

    throw err
  }

  [kAquire] () {
    if (this[kUsed] >= this[kLimit]) {
      return new Promise((resolve) => {
        this[kQueue].push(resolve)
      })
    }

    this[kUsed] += 1

    return pTry(() => this[kFactory].create()).catch((err) => this[kRevert](err))
  }

  [kRelease] (resource, error) {
    if (this[kQueue].length) {
      const next = this[kQueue].shift()

      if (this[kFactory].recycle) {
        next(pTry(() => this[kFactory].recycle(resource, error)).catch((err) => this[kRevert](err)))
      } else {
        next(resource)
      }

      return Promise.resolve()
    }

    if (this[kFactory].destroy) {
      return pTry(() => this[kFactory].destroy(resource, error))
    }

    return Promise.resolve()
  }

  async use (fn) {
    return this[kAquire]().then((resource) => {
      return pTry(() => fn(resource)).then(
        (val) => this[kRelease](resource, null).then(() => { return val }),
        (err) => this[kRelease](resource, err).then(() => { throw err })
      )
    })
  }
}

module.exports = ResourcePool
