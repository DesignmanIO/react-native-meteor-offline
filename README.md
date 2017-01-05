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

### Initializing
````javascript
// myReduxStuff.js
import initMeteorRedux from 'react-native-meteor-redux';
import {AsyncStorage} from 'react-native';
import {persistStore, autoRehydrate} form 'redux-persist';

const MeteorStore = initMeteorRedux(null, autoRehydrate());

persistStore(MeteorStore, {storage: AsyncStorage});

export {MeteorStore}
````

### Using cached collection
Note that this currently returns all documents, and find queries won't work. I hope to fix that soon.

````javascript
import {returnCached} from 'react-native-meteor-redux';
import {MeteorStore} from '../myReduxStuff';
import Meteor, {createContainer} from 'react-native-meteor';

const component = (props) => {
  const {docs} = props;
  return (
    <View>
      {
        docs.map((doc) => {
          <Text>{doc.title}, </Text>
        });
      }
    </View>
  )
}

export createContainer((props) => {
  const sub = Meteor.subscribe('example');
  return {
    docs: returnCached(Meteor.collection('docs').find({}), MeteorStore, 'docs');
  };
}, component)
````
