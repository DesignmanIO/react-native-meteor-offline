import { Meteor } from 'meteor/meteor';
import { Details } from '/collections/';

export default () => {
  Meteor.publish('details-list', () => {
    return Details.find();
  });
}
