var Collection, MemoryDb, NullTransaction, WithObservableReads, WithObservableWrites, WithReactMixin, WithServerQuery, processFind, utils, _;

NullTransaction = require('./NullTransaction');

WithObservableReads = require('./WithObservableReads');

WithObservableWrites = require('./WithObservableWrites');

WithReactMixin = require('./WithReactMixin');

WithServerQuery = require('./WithServerQuery');

_ = require('lodash');

utils = require('./utils');

processFind = require('./utils').processFind;

module.exports = MemoryDb = (function() {
  function MemoryDb() {
    this.collections = {};
    this.debug = true;
    this.batchedUpdates = function(cb) {
      return cb();
    };
    this.transaction = this.getDefaultTransaction();
  }

  MemoryDb.prototype.uncaughtExceptionHandler = function(e) {
    throw e;
  };

  MemoryDb.prototype.getDefaultTransaction = function() {
    return new NullTransaction();
  };

  MemoryDb.prototype.serialize = function() {
    var collectionName, data;
    data = {};
    for (collectionName in this.collections) {
      data[collectionName] = this.collections[collectionName].serialize();
    }
    return data;
  };

  MemoryDb.deserialize = function(data) {
    var collection, collectionName, db;
    db = new MemoryDb();
    for (collectionName in data) {
      collection = Collection.deserialize(db, data[collectionName]);
      db.collections[collectionName] = collection;
      db[collectionName] = collection;
    }
    return db;
  };

  MemoryDb.prototype.addCollection = function(name) {
    var collection;
    if (this[name] != null) {
      return;
    }
    collection = new Collection(name, this);
    this[name] = collection;
    return this.collections[name] = collection;
  };

  MemoryDb.prototype.withTransaction = function(transaction, func, context) {
    var prevTransaction;
    if (!this.transaction.canPushTransaction(transaction)) {
      throw new Error('Already in a transaction');
    }
    prevTransaction = this.transaction;
    this.transaction = transaction;
    try {
      return func.call(context);
    } finally {
      this.transaction = prevTransaction;
    }
  };

  return MemoryDb;

})();

_.mixin(MemoryDb.prototype, WithObservableReads);

_.mixin(MemoryDb.prototype, WithObservableWrites);

_.mixin(MemoryDb.prototype, WithReactMixin);

_.mixin(MemoryDb.prototype, WithServerQuery);

Collection = (function() {
  function Collection(name, db) {
    this.name = name;
    this.db = db;
    this.items = {};
    this.versions = {};
    this.version = 1;
  }

  Collection.prototype.serialize = function() {
    return {
      name: this.name,
      items: this.items,
      versions: this.versions,
      version: this.version
    };
  };

  Collection.deserialize = function(db, data) {
    var collection;
    collection = new Collection(data.name, db);
    collection.items = data.items;
    collection.versions = data.versions;
    collection.version = data.version;
    return collection;
  };

  Collection.prototype.find = function(selector, options) {
    return this.db.transaction.find(this.name, this._findFetch(selector, options), selector, options);
  };

  Collection.prototype.findOne = function(selector, options) {
    return this.db.transaction.findOne(this.name, this._findOne(selector, options), selector, options);
  };

  Collection.prototype._findOne = function(selector, options) {
    var results;
    options = options || {};
    results = this._findFetch(selector, options);
    if (results.length > 0) {
      return results[0];
    } else {
      return null;
    }
  };

  Collection.prototype._findFetch = function(selector, options) {
    return processFind(this.items, selector, options);
  };

  Collection.prototype.get = function(_id, missing) {
    return this.db.transaction.get(this.name, this._findOne({
      _id: _id
    }), _id) || missing || null;
  };

  Collection.prototype.upsert = function(docs) {
    var doc, item, items, _1, _2, _i, _len, _ref;
    _ref = utils.regularizeUpsert(docs), items = _ref[0], _1 = _ref[1], _2 = _ref[2];
    for (_i = 0, _len = items.length; _i < _len; _i++) {
      item = items[_i];
      doc = _.assign({}, this.items[item.doc._id] || {}, item.doc);
      this.items[item.doc._id] = doc;
      this.version += 1;
      this.versions[doc._id] = (this.versions[doc._id] || 0) + 1;
      this.items[doc._id]._version = this.versions[doc._id];
    }
    return this.db.transaction.upsert(this.name, docs, docs);
  };

  Collection.prototype.del = function(id) {
    var prev_version;
    if (_.has(this.items, id)) {
      prev_version = this.items[id]._version;
      this.version += 1;
      this.versions[id] = prev_version + 1;
      delete this.items[id];
    }
    return this.db.transaction.del(this.name, null, id);
  };

  Collection.prototype.remove = function(selector, options) {
    var results;
    results = this._findFetch(selector, options);
    return results.forEach((function(_this) {
      return function(doc) {
        return _this.del(doc._id);
      };
    })(this));
  };

  return Collection;

})();
