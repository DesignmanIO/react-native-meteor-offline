NullTransaction = require './NullTransaction'
WithObservableReads = require './WithObservableReads'
WithObservableWrites = require './WithObservableWrites'
WithReactMixin = require './WithReactMixin'
WithServerQuery = require './WithServerQuery'

_ = require 'lodash'
utils = require('./utils')
processFind = require('./utils').processFind

# TODO: use ImmutableJS (requires changing selector.js which will
# be painful). This will also let us do MVCC.

module.exports = class MemoryDb
  constructor: ->
    @collections = {}
    @debug = true
    @batchedUpdates = (cb) -> cb()
    @transaction = @getDefaultTransaction()

  uncaughtExceptionHandler: (e) -> throw e

  getDefaultTransaction: -> new NullTransaction()

  serialize: ->
    data = {}
    for collectionName of @collections
      data[collectionName] = @collections[collectionName].serialize()
    return data

  @deserialize: (data) ->
    db = new MemoryDb()
    for collectionName of data
      collection = Collection.deserialize db, data[collectionName]
      db.collections[collectionName] = collection
      db[collectionName] = collection
    return db

  addCollection: (name) ->
    if @[name]?
      return
    collection = new Collection(name, this)
    @[name] = collection
    @collections[name] = collection

  withTransaction: (transaction, func, context) ->
    if not @transaction.canPushTransaction(transaction)
      throw new Error('Already in a transaction')

    prevTransaction = @transaction
    @transaction = transaction
    try
      return func.call(context)
    finally
      @transaction = prevTransaction

_.mixin MemoryDb.prototype, WithObservableReads
_.mixin MemoryDb.prototype, WithObservableWrites
_.mixin MemoryDb.prototype, WithReactMixin
_.mixin MemoryDb.prototype, WithServerQuery

# Stores data in memory
class Collection
  constructor: (name, db) ->
    @name = name
    @db = db

    @items = {}
    @versions = {}
    @version = 1

  serialize: ->
    return {
      name: @name,
      items: @items,
      versions: @versions,
      version: @version,
    }

  @deserialize: (db, data) ->
    collection = new Collection(data.name, db)
    collection.items = data.items
    collection.versions = data.versions
    collection.version = data.version
    return collection

  find: (selector, options) ->
    return @db.transaction.find(
      @name,
      @_findFetch(selector, options),
      selector,
      options
    )

  findOne: (selector, options) ->
    return @db.transaction.findOne(
      @name,
      @_findOne(selector, options),
      selector,
      options
    )

  _findOne: (selector, options) ->
    options = options or {}

    results = @_findFetch(selector, options)
    return if results.length > 0 then results[0] else null

  _findFetch: (selector, options) ->
    processFind(@items, selector, options)

  get: (_id, missing) ->
    return @db.transaction.get(@name, @_findOne(_id: _id), _id) or missing or null

  upsert: (docs) ->
    [items, _1, _2] = utils.regularizeUpsert(docs)

    for item in items
      # Shallow copy since MemoryDb adds _version to the document.
      # TODO: should we get rid of this mutation?
      doc = _.assign({}, @items[item.doc._id] || {}, item.doc)

      # Replace/add
      @items[item.doc._id] = doc
      @version += 1
      @versions[doc._id] = (@versions[doc._id] || 0) + 1
      @items[doc._id]._version = @versions[doc._id]

    return @db.transaction.upsert @name, docs, docs

  del: (id) ->
    if _.has(@items, id)
      prev_version = @items[id]._version
      @version += 1
      @versions[id] = prev_version + 1
      delete @items[id]
    @db.transaction.del @name, null, id

  remove: (selector, options) ->
    results = @_findFetch selector, options
    results.forEach (doc) => @del doc._id
