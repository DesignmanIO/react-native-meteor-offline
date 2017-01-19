/**
 * Created by Julian on 12/30/16.
 */
import Meteor, {
    getData
} from 'react-native-meteor';
import {
    createStore
} from 'redux';
import _ from 'lodash';
import EventEmitter from 'events';

const meteorReduxReducers = (state = {}, action) => {
    // console.log(state, action, Meteor.ddp);
    const {
        type,
        collection,
        id,
        fields
    } = action;
    const docIndex = state ? _.findIndex(state[collection], {
        _id: id
    }) : undefined;
    switch (type) {
        case 'ADDED':
            if (!state[collection]) {
                return {
                    ...state,
                    [collection]: [
                        Object.assign(fields, {
                            _id: id
                        }),
                    ],
                };
            } else if (!_.find(state[collection], {
                    _id: id
                })) {
                return {
                    ...state,
                    [collection]: [
                        ...state[collection],
                        Object.assign(fields, {
                            _id: id
                        }),
                    ],
                };
            } else if (_.find(state[collection], {
                    _id: id
                })) {
                // console.warn(`${id} not added to ${collection}, duplicate found`);
            }
            return state;
        case 'CHANGED':
            return _.update(state, `${collection}[${docIndex}]`, (val) => {
                return _.merge(val, fields);
            });
        case 'REMOVED':
            if (docIndex > -1) {
                // console.log('rm\'d');
                const updatedCollection = state[collection].splice(docIndex);
                return {
                    ...state,
                    [collection]: updatedCollection,
                };
            }
            console.error(`Couldn't remove ${id}, not found in ${collection} collection`);
            return state;
        case 'persist/REHYDRATE':
            if (typeof Meteor.ddp === undefined || Meteor.ddp.status === "disconnected") {
                return action.payload;
            }
        default:
            return state;
    }
};

const meteorReduxEmitter = new EventEmitter();

const initMeteorRedux = (preloadedState = undefined, enhancer = null) => {
    // console.log(preloadedState, enhancer);
    const MeteorStore = createStore(meteorReduxReducers, preloadedState, enhancer);


    MeteorStore.loaded = () => {
        meteorReduxEmitter.emit('rehydrated');
    };

    meteorReduxEmitter.once('rehydrated', () => {
        // restore collections to minimongo
        _.each(MeteorStore.getState(), (collection, key) => {
            const onlyWithIds = _.filter(collection, (doc) => doc._id);
            if (!getData().db[key]) {
                // add collection to minimongo
                getData().db.addCollection(key);
            }
            // add documents to collection
            getData().db[key].upsert(onlyWithIds);
        });
    });

    Meteor.waitDdpConnected(() => {
        // question: do I need to check for disconnection?
        let connected = true;
        Meteor.ddp.on('disconnected', () => {
            connected = false;
        });
        if (connected) {
            Meteor.ddp.on('removed', (obj) => {
                const {
                    collection,
                    id,
                    fields
                } = obj;
                MeteorStore.dispatch({
                    type: 'REMOVED',
                    collection,
                    id,
                    fields
                });
            });
            Meteor.ddp.on('changed', (obj) => {
                const {
                    collection,
                    id,
                    fields
                } = obj;
                MeteorStore.dispatch({
                    type: 'CHANGED',
                    collection,
                    id,
                    fields
                });
            });
            Meteor.ddp.on('added', (obj) => {
                const {
                    collection,
                    id,
                    fields
                } = obj;
                MeteorStore.dispatch({
                    type: 'ADDED',
                    collection,
                    id,
                    fields
                });
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
    if (Meteor.ddp.status === 'disconnected') {
            return {
                ready: () => !!store.getState(),
                offline: true,
            };
        Meteor.waitDdpConnected(() => {
            if (Meteor.ddp.status === 'connected') {
                return Meteor.subscribe(name, ...args);
            }
        });
    }
    return Meteor.subscribe(name, ...args);
}

returnCached = (cursor, store, collectionName) => {
    if (Meteor.ddp && Meteor.ddp.status === 'disconnected') {
        return store.getState()[collectionName] || [];
    }
    return cursor;
}

export {
    meteorReduxReducers,
    subscribeCached,
    returnCached
};
export default initMeteorRedux;
// export default connectMeteorRedux;
