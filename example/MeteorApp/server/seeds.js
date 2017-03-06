import Details from '/lib/collections/details';

const seed = () => {
  if (Details.find().count() === 0) {
    let count = 10;
    let doc = {name: 'Detail'};
    if (Meteor.settings.powerHungry) {
      count = 10000;
      doc = {
        "name": 'Detail',
        "index": 0,
        "guid": "dd3401b0-d802-40ba-8ad2-98cc1b393846",
        "isActive": true,
        "balance": "$3,616.93",
        "picture": "http://placehold.it/32x32",
        "age": 35,
        "eyeColor": "brown",
        "name": {
          "first": "Johnnie",
          "last": "Merritt"
        },
        "company": "LIQUICOM",
        "email": "johnnie.merritt@liquicom.biz",
        "phone": "+1 (826) 589-3689",
        "address": "420 Railroad Avenue, Denio, Missouri, 2330",
        "about": "Cupidatat enim velit esse incididunt. Laborum ex exercitation cillum officia irure eiusmod occaecat veniam aliqua enim cupidatat. Qui enim tempor mollit ut consectetur aliquip elit.",
        "registered": "Saturday, December 17, 2016 2:58 AM",
        "latitude": "6.621428",
        "longitude": "81.120502",
        "tags": [
          "aliqua",
          "elit",
          "sint",
          "occaecat",
          "duis"
        ],
        "range": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9
        ],
        "friends": [
          {
            "id": 0,
            "name": "Branch Morse"
          },
          {
            "id": 1,
            "name": "Knapp Kent"
          },
          {
            "id": 2,
            "name": "Valenzuela Hammond"
          }
        ],
        "greeting": "Hello, Johnnie! You have 9 unread messages.",
        "favoriteFruit": "strawberry"
      };
    }
    for (let i = 0; i < count; i++) {
      Details.insert(doc);
    }
  }
}

export default seed;
