/**
 * Created by Julian on 12/30/16.
 */
import Meteor, {getData} from 'react-native-meteor';
import {createStore} from 'redux';
import _ from 'lodash';
import EventEmitter from 'events';
import nextFrame from 'next-frame';

const meteorReduxReducers = (state = {}, action) => {
    // console.log(state, action, Meteor.ddp);
    const {type, collection, id, fields} = action;
    const docIndex = state ? _.findIndex(state[collection], {_id: id}) : undefined;
    switch (type) {
        case 'ADDED':
            // collection doesn't exist yet, add it
            if (!state[collection]) {
                return {
                    ...state,
                    [collection]: Object.assign(fields, {_id: id}),
                };
            // no doc with _id exists yet
            } else if (!_.find(state[collection], {_id: id})) {
                return {
                    ...state,
                    [collection]: [
                        ...state[collection],
                        {...Object.assign(fields, {_id: id})},
                    ],
                };
            // duplicate found, don't insert
            } else if (_.find(state[collection], {_id: id})) {
                // console.warn(`${id} not added to ${collection}, duplicate found`);
                // console.log([...updatedCollection()]);
                const withUpdatedDoc = _.clone(state[collection]);
                withUpdatedDoc[docIndex] = Object.assign(fields, {_id: id});
                return {
                  ...state,
                    [collection]: [
                      ...withUpdatedDoc,
                    ]
                }
            }
            return state;
        case 'CHANGED':
            return _.update(state, `${collection}[${docIndex}]`, (val) => {
                return _.merge(val, fields);
            });
        case 'REMOVED':
            if (docIndex > -1) {
                // console.log('rm\'d');
                const withoutDoc = state[collection].splice(docIndex);
                return {
                    ...state,
                    [collection]: withoutDoc,
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
            // add the collection if it doesn't exist
            if (!getData().db[key]) {
                // add collection to minimongo
                getData().db.addCollection(key);
            }
            // only upsert if the data doesn't match
            if(getData().db[key] !== collection){
                // add documents to collection
                getData().db[key].upsert(onlyWithIds);
            }
        });
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
                const {collection,id,fields} = obj;
                // Next frame awaits the next animation frame before continuing
                await nextFrame();
                MeteorStore.dispatch({type: 'REMOVED',collection,id,fields});
            });
            Meteor.ddp.on('changed', async (obj) => {
                const {collection,id,fields} = obj;
                await nextFrame();
                MeteorStore.dispatch({type: 'CHANGED',collection,id,fields});
            });
            Meteor.ddp.on('added', async (obj) => {
                const {collection,id,fields} = obj;
                await nextFrame();
                MeteorStore.dispatch({type: 'ADDED',collection,id,fields});
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
    if (Meteor.ddp && Meteor.ddp.status === 'disconnected') {
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
