# react-native-meteor-redux
Links react-native-meteor to redux

## Install
`npm install react-native-meteor-redux`

## Use
````javascript
import initMeteorRedux from 'react-native-meteor-redux';

const MeteorStore = initMeteorRedux(initialState, enhancers);

// Now you can use MeteorStore as a redux store throughout your app.
export {MeteorStore};
````

## With Redux Persist
! Note, this appears to be currently broken

````javascript
import initMeteorRedux from 'react-native-meteor-redux';
import {AsyncStorage} from 'react-native';
import {persistStore, autoRehydrate} form 'redux-persist';

const MeteorStore = initMeteorRedux(null, autoRehydrate());

persistStore(MeteorStore, {storage: AsyncStorage});
````
