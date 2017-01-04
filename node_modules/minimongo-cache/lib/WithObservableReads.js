var ObservableRead, ReadTransaction, WithObservableReads, _;

ReadTransaction = require('./ReadTransaction');

_ = require('lodash');

ObservableRead = (function() {
  function ObservableRead(db, func, context) {
    this.db = db;
    this.func = func;
    this.context = context;
    this.lastReadTransaction = null;
    this.lastValue = null;
    this.subscribers = [];
    this.changeListener = this.changeListener.bind(this);
    this.db.on('change', this.changeListener);
    this.rerunTransaction();
  }

  ObservableRead.prototype.subscribe = function(cb) {
    this.subscribers.push(cb);
    cb(this.lastValue);
    return this;
  };

  ObservableRead.prototype.dispose = function() {
    return this.db.removeListener('change', this.changeListener);
  };

  ObservableRead.prototype.rerunTransaction = function() {
    var nextReadTransaction, prevValue, value;
    nextReadTransaction = new ReadTransaction();
    value = this.db.withTransaction(nextReadTransaction, this.func, this.context);
    if (!this.lastReadTransaction || !_.isEqual(this.lastReadTransaction.log, nextReadTransaction.log)) {
      this.lastReadTransaction = nextReadTransaction;
      prevValue = this.lastValue;
      this.lastValue = value;
      return this.subscribers.forEach((function(cb) {
        cb(this.lastValue, prevValue);
      }), this);
    }
  };

  ObservableRead.prototype.changeListener = function(changeRecords) {
    var collectionName, dirtyIdsForCollection, documentFragment, documentFragments, i;
    if (!this.lastReadTransaction) {
      this.rerunTransaction();
      return;
    }
    for (collectionName in changeRecords) {
      if (this.lastReadTransaction.dirtyScans[collectionName]) {
        this.rerunTransaction();
        return;
      }
      dirtyIdsForCollection = this.lastReadTransaction.dirtyIds[collectionName] || {};
      documentFragments = changeRecords[collectionName];
      i = 0;
      while (i < documentFragments.length) {
        documentFragment = documentFragments[i];
        if (dirtyIdsForCollection[documentFragment._id]) {
          this.rerunTransaction();
          return;
        }
        i++;
      }
    }
  };

  return ObservableRead;

})();

WithObservableReads = {
  observe: function(func, context) {
    return new ObservableRead(this, func, context);
  }
};

module.exports = WithObservableReads;
