var NullTransaction, ReadOnlyTransaction, WriteTransaction,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

NullTransaction = require('./NullTransaction');

WriteTransaction = require('./WriteTransaction');

ReadOnlyTransaction = (function(_super) {
  __extends(ReadOnlyTransaction, _super);

  function ReadOnlyTransaction() {
    return ReadOnlyTransaction.__super__.constructor.apply(this, arguments);
  }

  ReadOnlyTransaction.prototype.canPushTransaction = function(transaction) {
    return !(transaction instanceof WriteTransaction);
  };

  return ReadOnlyTransaction;

})(NullTransaction);

module.exports = ReadOnlyTransaction;
