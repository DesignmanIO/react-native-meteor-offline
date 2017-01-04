var EventEmitter, WithObservableWrites, WriteTransaction, _;

EventEmitter = require('eventemitter3');

WriteTransaction = require('./WriteTransaction');

_ = require('lodash');

WithObservableWrites = {
  getDefaultTransaction: function() {
    this.setMaxListeners(0);
    return new WriteTransaction(this);
  }
};

_.mixin(WithObservableWrites, EventEmitter.prototype);

module.exports = WithObservableWrites;
