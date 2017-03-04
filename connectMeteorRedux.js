/**
 * Created by Julian on 12/30/16.
 */
import Meteor, {getData} from 'react-native-meteor';
import {createStore} from 'redux';
import _ from 'lodash';
import EventEmitter from 'events';
import nextFrame from 'next-frame';
import Realm from 'realm';

const meteorReduxReducers = (state = {}, action) => {
    const {type, collection, id, fields} = action;
    switch (type) {
        case 'ADDED':
            // collection doesn't exist yet, add it
            if (!state[collection]) {
                return {
                    ...state,
                    [collection]: {
                        [id]: fields,
                    },
                };
                // no doc with _id exists yet
            } else if (!state[collection][id]) {
                return {
                    ...state,
                    [collection]: {
                        ...state[collection],
                        [id]: fields,
                    },
                };
                // duplicate found, update it
            } else if (state[collection] && state[collection][id]){
                // console.warn(`${id} not added to ${collection}, duplicate found`);
                return {
                    ...state,
                    [collection]: {
                      ...state[collection],
                        [id]: {...fields, ...state[collection][id]},
                    }
                };
            }
            return state;
        case 'CHANGED':
            return {
              ...state,
                [collection]: {
                    ...state[collection],
                    [id]: _.merge(state[collection][id], fields),
                }
            };
        case 'REMOVED':
            if (state[collection][id]) {
              const withoutDoc = {...state};
              delete withoutDoc[collection][id];
              return withoutDoc;
            }
            // console.error(`Couldn't remove ${id}, not found in ${collection} collection`);
            return state;
        case 'SET_READY':
            return {
              ...state,
                ready: action.ready,
            }
        case 'persist/REHYDRATE':
            if (typeof Meteor.ddp === 'undefined' || Meteor.ddp.status === 'disconnected') {
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

const restoreData = (source) => {
  _.each(source, async (collection, key) => {
    await nextFrame();
    if (collection) {
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
    }
  });
};

const initMeteorRealm = ({blackList}) => {
  const MeteorStore = new Realm({
    schema: [{
      name: 'Collection',
      primaryKey: 'name',
      properties: {
        name: 'string',
        documents: {
          type: 'list',
          objectType: 'Document',
        },
      },
    }, {
      name: 'Document',
      primaryKey: '_id',
      properties: {
        _id: 'string',
        fields: 'string',
      },
    }],
    schemaVersion: 2,
    // migration(oldR, newR) {
    //   if (oldR.schemaVersion !== 2 ) {
    //     const oldO = oldR.objects('Document');
    //     const newO = newR.objects('Document');
    //     for (let i = 0; i < oldR.length; i++) {
    //       newO[i].fields = oldO[i].value;
    //     }
    //   }
    // },
  });

  MeteorStore.type = 'realm';
  const t = new Date();
  const getTime = (msg, timeSince) => {
    const newTime = new Date();
    const dif = newTime - timeSince;
    if (dif > 1000) {
      console.log(`${msg} in %c${dif}ms`, 'color: red;');
    } else {
      console.log(`${msg} in ${newTime - timeSince}ms`);
    }
    return newTime;
  };
  const getRealmData = () => {
    const data = {};
    const beforeC = new Date();
    // const cloneRecord = (id, val) => {
    //   return {_id: id, ...JSON.parse(val)};
    // };
    MeteorStore.objects('Collection').forEach((collection) => {
      const beforeD = getTime(`--- Time to get collection ${collection.name}`, beforeC);
      const documents = collection.documents;
      getTime(`got ${documents.length} docs`, beforeD);
      // const docClone = _.cloneDeep(documents);
      documents.removeAllListeners();
      getTime('removed listeners', beforeD);
      // documents.forEach((doc) => {const a = "b"});
      // console.log();
      documents.map((doc) => {
        return doc;
      });
      getTime(`cloned ${documents.length} docs`, beforeD);
      // getTime('Time to fetch docs', beforeD);
      data[collection.name] = documents;
    });
    getTime('fully fetched', t);
    console.log(data);
    return data;
  };
  restoreData(getRealmData());

  Meteor.waitDdpConnected(() => {
    Meteor.ddp.on('added', async ({collection, id, fields}) => {
      await nextFrame();
      if (blackList.indexOf(collection) < 0) {
        let realmCollection = MeteorStore.objectForPrimaryKey('Collection', collection);
        const jsonFields = JSON.stringify(fields);
        MeteorStore.write(() => {
          if (!realmCollection) {
            realmCollection = MeteorStore.create('Collection', {name: collection});
          }
          const doc = MeteorStore.objectForPrimaryKey('Document', id);
          const docInCollection = realmCollection.documents.filtered('_id = $0', id)[0];
          if (!doc) {
            realmCollection.documents.push({_id: id, fields: jsonFields});
          } else if (!docInCollection) {
            realmCollection.documents.push(doc);
          } else if (jsonFields !== doc.fields) {
            doc.fields = jsonFields;
          }
        });
      }
    });
    Meteor.ddp.on('changed', ({collection, id, fields}) => {
      if (blackList.indexOf(collection) < 0) {
        MeteorStore.write(() => {
          const realmCollection = MeteorStore.objectForPrimaryKey('Collection', collection);
          const doc = realmCollection.documents.filtered('_id = $0', id)[0];
          const jsonFields = JSON.stringify(fields);
          if (jsonFields !== doc.fields) {
            doc.fields = JSON.stringify(fields);
          }
        });
      }
    });
    Meteor.ddp.on('removed', ({collection, id}) => {
      const realmCollection = MeteorStore.objectForPrimaryKey('Collection', collection);
      const doc = realmCollection.documents.filtered('_id = $0', id)[0];
      MeteorStore.write(() => {
        MeteorStore.delete(doc);
      });
    });
  })
  ;

  return MeteorStore;
};

const initMeteorRedux = (preloadedState = undefined, enhancer = undefined) => {
    // console.log(preloadedState, enhancer);
    const MeteorStore = createStore(meteorReduxReducers, preloadedState, enhancer);

    MeteorStore.loaded = () => {
        meteorReduxEmitter.emit('rehydrated');
    };

    MeteorStore.type = 'redux';

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
            if(!_.isEqual(getData().db[key], collection)){
                // add documents to collection
                getData().db[key].upsert(correctedCollection);
            }
        });
        MeteorStore.dispatch({type: 'SET_READY', ready: true});
    });

    Meteor.waitDdpConnected(() => {
        // return false;
        // question: do I need to check for disconnection?
        let connected = true;
        Meteor.ddp.on('disconnected', () => {
            connected = false;
        });
        if (connected) {
            Meteor.ddp.on('removed', async (obj) => {
                const {collection, id} = obj;
                const fields = obj.fields || {};
                await nextFrame();
                MeteorStore.dispatch({type: 'REMOVED', collection, id, fields});
            });
            Meteor.ddp.on('changed', async (obj) => {
                const {collection, id} = obj;
                const fields = obj.fields || {};
                await nextFrame();
                MeteorStore.dispatch({type: 'CHANGED', collection, id, fields});
            });
            Meteor.ddp.on('added', async (obj) => {
                const {collection, id} = obj;
                const fields = obj.fields || {};
                fields._id = id;
                const getCollection = MeteorStore.getState()[collection];
                if(
                  !getCollection ||
                  !getCollection[id] ||
                  !_.isEqual(getCollection[id], fields)
                ){
                    MeteorStore.dispatch({type: 'ADDED', collection, id, fields});
                }
            });
        }
    });

    return MeteorStore;
};

class MeteorStore {
    constructor(props) {

    }
}

const subscribeCached = (store, name, ...args) => {
    Meteor.waitDdpConnected(() => {
        if (Meteor.ddp.status === 'connected') {
            return Meteor.subscribe(name, ...args);
        }
    });
    // fallback if store not initialized
    if (!store) return Meteor.subscribe(name, ...args);
    // if callback exists, run it
    if(typeof args[args.length - 1] === 'function' && store.getState().ready){
        const callback = _.once(args[args.length - 1]);
        callback();
    }
    if (store.type === 'redux') {
      if (store.getState().ready) {
        callback(null, ready(true));
      }
      return ready(store.getState().ready);
    } else if (store.type === 'realm') {
      callback(null, ready(true));
      return ready(true);
    }
    // One of the above values should have returned...
    console.warn('Something went wrong', store);
    return false;
}

returnCached = (cursor, store, collectionName, doDisable) => {
    if (Meteor.ddp && Meteor.ddp.status === 'disconnected') {
        return store.getState()[collectionName] || [];
    }
    return cursor;
}

export {
  meteorReduxReducers,
  subscribeCached,
  returnCached,
  initMeteorRealm,
};
export default initMeteorRedux;
// export default connectMeteorRedux;
