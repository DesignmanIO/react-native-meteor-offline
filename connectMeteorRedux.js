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
    case 'SET_USRID': {
      return { ...state, userId: id };
    }
    case 'RECENTLY_ADDED': {
      let tmpReactNativeMeteorOfflineRecentlyAdded = state.reactNativeMeteorOfflineRecentlyAdded ? _.cloneDeep(state.reactNativeMeteorOfflineRecentlyAdded) : {};
      _.set(tmpReactNativeMeteorOfflineRecentlyAdded,
        `${collection}`,
        _.get(
          tmpReactNativeMeteorOfflineRecentlyAdded,
          `${collection}`,
          []
        )
      );
      tmpReactNativeMeteorOfflineRecentlyAdded[collection].push(id);
      return { ...state, reactNativeMeteorOfflineRecentlyAdded: tmpReactNativeMeteorOfflineRecentlyAdded };
    }
    case 'ADDED': {
      let newState;
      if (!state[collection]) {
        // collection doesn't exist yet, add it with doc and 'new' flag
        return { ...state, [collection]: { [id]: fields } };
      } else if (!state[collection][id]) {
        // no doc with _id exists yet, add it
        const tmpCollection = _.cloneDeep(state[collection]);
        tmpCollection[id] = fields;
        return { ...state, [collection]: tmpCollection };
      } else if (state[collection] && state[collection][id]) {
        // duplicate found, update it
        // console.warn(`${id} not added to ${collection}, duplicate found`);
        if (_.isEqual(state[collection][id], fields)) return state;
        const tmpCollection = _.cloneDeep(state[collection]);
        tmpCollection[id] = fields;
        return { ...state, [collection]: tmpCollection };
      }
      return state;
    }
    case 'CHANGED': {
      const tmpCollection = _.cloneDeep(state[collection]);
      tmpCollection[id] = _.merge(tmpCollection[id], fields);
      return { ...state, [collection]: tmpCollection };
    }
    case 'REMOVED':
      if (state[collection][id]) {
        const tmpCollection = _.cloneDeep(state[collection]);
        delete tmpCollection[id];
        return { ...state, [collection]: tmpCollection };
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
      let tmpReactNativeMeteorOfflineRecentlyAdded = _.cloneDeep(state.reactNativeMeteorOfflineRecentlyAdded);
      _.set(tmpReactNativeMeteorOfflineRecentlyAdded, `${collection}`, []);
      let tmpCollection = _.cloneDeep(state[collection]);
      tmpCollection = _.omit(tmpCollection, removed);
      getData().db[collection].remove({ _id: { $in: removed } });
      return { ...state, [collection]: tmpCollection, reactNativeMeteorOfflineRecentlyAdded: tmpReactNativeMeteorOfflineRecentlyAdded };
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
        const { collection, id } = obj;
        const fields = obj.fields || {};
        fields._id = id;
        const getCollection = MeteorStore.getState()[collection];
        if (
          !getCollection ||
          !getCollection[id] ||
          !_.isEqual(getCollection[id], fields)
        ) {
          // don't insert if it exists
          MeteorStore.dispatch({ type: 'ADDED', collection, id, fields });
        }
        MeteorStore.dispatch({ type: 'RECENTLY_ADDED', collection, id });
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
    // first time connecting since app open or connection restored
    this.firstConnection = true;
    this.subscriptions = [];
    this.collections = [];
    if (!options.store) {
      this.store = initMeteorRedux(undefined, autoRehydrate());
    }
    this.persister = persistStore(
      this.store,
      {
        storage: AsyncStorage,
        debounce: options.debounce || 1000,
        blacklist: ['reactNativeMeteorOfflineRecentlyAdded'],
      },
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
        this.firstConnection = false;
      }
    });
  }
  user() {
    if (Meteor.user()) {
      this.store.dispatch({ type: 'SET_USERID', id: Meteor.userId() });
      return Meteor.user();
    }
    const { userId } = this.store.getState();
    return Meteor.collection('users').findOne(userId);
  }
  subscribe(uniqueName, name, ...params) {
    const hasCallback = typeof params[params.length - 1] === 'function';
    const justParams = params.slice(0, params.length - 1);
    _.set(this.subscriptions, `${uniqueName}.${name}`, name);
    _.set(this.subscriptions, `${uniqueName}.${params}`, JSON.stringify(justParams));
    let subHandle = Meteor.subscribe(name, ...params);
    if (this.offline) {
      subHandle = {
        ready: () => {
          // ready === rehydrated
          return this.store.getState().ready || false;
        },
        offline: this.offline,
      };
    }
    // run callback if it's offline and ready for the first time
    if (this.offline && hasCallback && this.store.getState().ready && !this.subscriptions[uniqueName].ready) {
      // handled by meteor.subscribe if online
      const callback = _.once(params[params.length - 1]);
      callback();
    }
    this.subscriptions[uniqueName].ready = subHandle.ready();
    return subHandle;
  }
  collection(collection, subscriptionName) {
    if (
      Meteor.status().connected &&
      this.firstConnection &&
      _.get(this.subscriptions, `${subscriptionName}.ready`)
    ) {
      this.firstConnection = false;
      // const t = new Date();
      const added = _.sortBy(
        _.get(this.store.getState(), `reactNativeMeteorOfflineRecentlyAdded.${collection}`)
      );
      const cached = _.sortBy(_.keys(this.store.getState()[collection]));
      // console.log(`got cached in ${new Date() - t}ms`);
      const removed = _.sortBy(_.difference(cached, added)) || [];
      // console.log(
      //   `got difference in ${new Date() - t}ms`,
      //   added,
      //   cached,
      //   removed,
      //   this.store.getState().reactNativeMeteorOfflineRecentlyAdded
      // );
      this.store.dispatch({
        type: 'REMOVE_AFTER_RECONNECT',
        collection,
        removed,
      });
    }
    this.collections = _.uniq([...this.collections, collection]);
    return Meteor.collection(collection);
  }
}

export { meteorReduxReducers, subscribeCached, returnCached, MeteorOffline };
export default initMeteorRedux;
