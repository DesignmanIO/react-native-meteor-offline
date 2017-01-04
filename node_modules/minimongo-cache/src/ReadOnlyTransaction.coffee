NullTransaction = require './NullTransaction'
WriteTransaction = require './WriteTransaction'

class ReadOnlyTransaction extends NullTransaction
  canPushTransaction: (transaction) -> !(transaction instanceof WriteTransaction)

module.exports = ReadOnlyTransaction
