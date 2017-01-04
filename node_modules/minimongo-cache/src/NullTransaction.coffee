class NullTransaction
  get: (collectionName, result, args...) -> result
  find: (collectionName, result, args...) -> result
  findOne: (collectionName, result, args...) -> result
  upsert: (collectionName, result, args...) ->
    throw new Error('Cannot write outside of a WriteTransaction')
  del: (collectionName, result, args...) ->
    throw new Error('Cannot write outside of a WriteTransaction')
  canPushTransaction: (transaction) -> true

module.exports = NullTransaction
