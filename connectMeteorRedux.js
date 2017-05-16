/**
 * Created by Julian on 12/30/16.
 */
import Meteor, { getData } from 'react-native-meteor';
import { createStore, combineReducers } from 'redux';
import { AsyncStorage } from 'react-native';
import _ from 'lodash';
import EventEmitter from 'events';
import { persistStore, autoRehydrate } from 'redux-persist';

const meteorReduxReducers = (
  state = { reactNativeMeteorOfflineRecentlyAdded: {} },
  action
) => {
  const { type, collection, id, fields } = action;
  switch (type) {
    case 'RECENTLY_ADDED': {
      const newState = _.clone(state);
      _.set(
        newState,
        `reactNativeMeteorOfflineRecentlyAdded.${collection}`,
        _.get(newState, `reactNativeMeteorOfflineRecentlyAdded.${collection}`, []),
      );
      newState.reactNativeMeteorOfflineRecentlyAdded[collection].push(id);
      return newState;
    }
    case 'ADDED': {
      let newState;
      if (!state[collection]) {
        // collection doesn't exist yet, add it with doc and 'new' flag
        newState = _.clone(state);
        newState[collection] = { [id]: fields };
        return newState;
      } else if (!state[collection][id]) {
        // no doc with _id exists yet, add it
        newState = _.clone(state);
        newState[collection][id] = fields;
        return newState;
      } else if (state[collection] && state[collection][id]) {
        // duplicate found, update it
        // console.warn(`${id} not added to ${collection}, duplicate found`);
        if (_.isEqual(state[collection][id], fields)) return state;
        newState = _.clone(state);
        newState[collection][id] = { ...state[collection][id], ...fields };
        return newState;
      }
      return state;
    }
    case 'CHANGED': {
      const newState = _.clone(state);
      newState[collection][id] = _.merge(state[collection][id], fields);
      return newState;
    }
    case 'REMOVED':
      if (state[collection][id]) {
        const newState = _.clone(state);
        delete newState[collection][id];
        return newState;
      }
      // console.error(`Couldn't remove ${id}, not found in ${collection} collection`);
      return state;
    case 'SET_READY':
      // todo: check for removed docs
      return {
        ...state,
        ready: action.ready,
      };
    case 'REMOVE_AFTER_RECONNECT':
      // todo: check for removed docs
      const { removed } = action;
      const newState = _.clone(state);
      newState.reactNativeMeteorOfflineRecentlyAdded[collection] = [];
      newState[collection] = _.omit(newState[collection], removed);
      console.log('collection now contains ', _.size(newState[collection]));
      getData().db[collection].remove({ _id: { $in: removed } });
      return newState;
    case 'persist/REHYDRATE':
      if (
        typeof Meteor.ddp === 'undefined' ||
        Meteor.ddp.status === 'disconnected'
      ) {
        return action.payload;
      }
      return state;
    case 'HARDRESET':
      console.log('hard reset');
      return {};
    default:
      return state;
  }
};

const meteorReduxEmitter = new EventEmitter();

const initMeteorRedux = (
  preloadedState = undefined,
  enhancer = undefined,
  customReducers = undefined
) => {
  // console.log(preloadedState, enhancer)
  const newReducers = customReducers !== undefined
    ? combineReducers({ ...customReducers, meteorReduxReducers })
    : meteorReduxReducers;
  const MeteorStore = createStore(newReducers, preloadedState, enhancer);

  MeteorStore.loaded = () => {
    meteorReduxEmitter.emit('rehydrated');
  };

  meteorReduxEmitter.once('rehydrated', () => {
    // restore collections to minimongo
    _.each(MeteorStore.getState(), (collection, key) => {
      const correctedCollection = _.chain(collection)
        .map((doc) => doc)
        .filter('_id')
        .value();
      // add the collection if it doesn't exist
      if (!getData().db[key]) {
        // add collection to minimongo
        getData().db.addCollection(key);
      }
      // only upsert if the data doesn't match
      if (!_.isEqual(getData().db[key], collection)) {
        // add documents to collection
        getData().db[key].upsert(correctedCollection);
      }
    });
    MeteorStore.dispatch({ type: 'SET_READY', ready: true });
  });

  Meteor.waitDdpConnected(() => {
    // return false;
    // question: do I need to check for disconnection?
    let connected = true;
    Meteor.ddp.on('disconnected', () => {
      connected = false;
    });
    if (connected) {
      Meteor.ddp.on('removed', (obj) => {
        const { collection, id } = obj;
        const fields = obj.fields || {};
        MeteorStore.dispatch({ type: 'REMOVED', collection, id, fields });
      });
      Meteor.ddp.on('changed', (obj) => {
        const { collection, id } = obj;
        const fields = obj.fields || {};
        MeteorStore.dispatch({ type: 'CHANGED', collection, id, fields });
      });
      Meteor.ddp.on('added', (obj, ...args) => {
        // console.log(this._subscriptionHandle);
        // console.log(getData);
        // console.log(getData());
        // console.log(getData().subscriptions);
        const { collection, id } = obj;
        const fields = obj.fields || {};
        fields._id = id;
        const getCollection = MeteorStore.getState()[collection];
        if (
          !getCollection ||
          !getCollection[id] ||
          !_.isEqual(getCollection[id], fields)
        ) {
          MeteorStore.dispatch({ type: 'ADDED', collection, id, fields });
          MeteorStore.dispatch({ type: 'RECENTLY_ADDED', collection, id });
        }
      });
    }
  });

  return MeteorStore;
};

const subscribeCached = (store, name, ...args) => {
  let offline = true;
  const subHandle = Meteor.subscribe(name, ...args);
  Meteor.waitDdpConnected(() => {
    if (Meteor.ddp.status === 'connected') {
      offline = false;
    }
  });
  if (!store || !offline) return subHandle;
  if (typeof args[args.length - 1] === 'function' && store.getState().ready) {
    const callback = _.once(args[args.length - 1]);
    callback();
  }
  return {
    ready: () => {
      return store.getState().ready || false;
    },
    offline: true,
  };
};

const returnCached = (cursor, store, collection, doDisable) => {
  console.warn('returnCached is deprecated and will be removed soon');
  if (Meteor.ddp && Meteor.ddp.status === 'disconnected') {
    return store.getState()[collection] || [];
  }
  return cursor;
};

class MeteorOffline {
  constructor(options = {}) {
    this.offline = true;
    this.subscriptions = [];
    this.collections = [];
    if (!options.store) {
      this.store = initMeteorRedux(undefined, autoRehydrate());
    }
    this.persister = persistStore(
      this.store,
      { storage: AsyncStorage, debounce: options.debounce || 1000 },
      () => {
        this.store.loaded();
      }
    );
    console.log('initializing');
    Meteor.waitDdpConnected(() => {
      if (Meteor.ddp.status === 'connected') {
        this.offline = false;
      } else {
        this.offline = true;
      }
    });
  }
  subscribe(uniqueName, name, ...params) {
    const hasCallback = typeof params[params.length - 1] === 'function';
    const justParams = params.slice(0, params.length - 1);
    this.subscriptions[uniqueName] = {
      name,
      params: JSON.stringify(justParams),
      ready: false,
    };
    let subHandle = Meteor.subscribe(name, ...params);
    if (this.offline) {
      subHandle = {
        ready: () => {
          return this.store.getState().ready || false;
        },
        offline: this.offline,
      };
    }
    if (this.offline && hasCallback && this.store.getState().ready) {
      // handled by meteor.subscribe if online
      const callback = _.once(params[params.length - 1]);
      callback();
    }
    this.subscriptions[uniqueName].ready = subHandle.ready();
    return subHandle;
  }
  collection(collection, subscriptionName) {
    // console.log(_.get(this.subscriptions, `${subscriptionName}.ready`), `${subscriptionName}.ready`);
    if (
      Meteor.status().connected &&
      _.get(this.subscriptions, `${subscriptionName}.ready`)
    ) {
    // TODO: the above test is too eager and calls before all documents are collected
      const t = new Date();
      // const cached = _.filter(this.store.getState()[collection], (key, doc) => {
      //   // console.log(doc.reactNativeMeteorOfflineIsNew);
      //   return doc.reactNativeMeteorOfflineIsNew;
      // });
      const added = _.sortBy(
        this.store.getState().reactNativeMeteorOfflineRecentlyAdded[collection]
      );
      const cached = _.sortBy(_.keys(this.store.getState()[collection]));
      console.log(`got cached in ${new Date() - t}ms`);
      const removed = _.sortBy(_.difference(cached, added));
      console.log(
        `got difference in ${new Date() - t}ms`,
        added,
        cached,
        removed,
        this.store.getState().reactNativeMeteorOfflineRecentlyAdded
      );
      this.store.dispatch({
        type: 'REMOVE_AFTER_RECONNECT',
        collection,
        removed,
      });
      // removed.forEach((id) => {
      //   console.log('a doc was deleted');
      //   this.store.dispatch({ type: 'REMOVED', collection, id });
      // });
    }
    this.collections = _.uniq([...this.collections, collection]);
    return Meteor.collection(collection);
  }
}

export { meteorReduxReducers, subscribeCached, returnCached, MeteorOffline };
export default initMeteorRedux;
// export default connectMeteorRedux;
