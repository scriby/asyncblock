node-green-light --- A simple stop and go interace to node-fibers
=================================================================

This code aims to be a minimal wrapper to ease calling existing asynchronous 
from a synchronous(fiber) context. A green-light-fiber gets two functions, 
one for pausing ('red light', 'pause', 'stop' or 'yield') and one for resuming 
('green light', 'resume' 'go' or 'run'). It is so minimal hardly deservers to
be a module in its own. However, possibly it does make use of fibers a tad easier.

The resume() function is simply handed to asynchronous code as callback and 
the fiber then pauses() for it. This way all this pointers simply stay as 
they where in asynchronous mode.

The pause function returns an array of all arguments passed to resume.

EXAMPLES
--------
A simple timeout

```javascript
var greenlight = require('green-light');

greenlight(function(pause, resume) {
	console.log('starting timer');
	setTimeout(resume, 2000, 'an argument'); 
	pause();
	console.log('two seconds passed');
}
console.log('the main context is not impressed');
```

Or inserting an entry into a mongodb.

```
var mongodb = require('mongodb');
var server    = new mongodb.Server('localhost', mongo.Connection.DEFAULT_PORT, {});
var connector = new mongodb.Db('test', dbserver, {});
var greenlight = require('green-light');
greenlight(red, green, cancel) {
	// redCheck auto fails if argument 0 is set (mongodb error);
	var redCheck = function() 
		{ var a = red(); if (a[0]) { console.warn(a[0].message); cancel(); }; return a; }
	connector.open(green);
	var dbclient = redCheck()[1];
	dbclient.collection('test_collection', green);
	var collection = redCheck()[1];
	collection.insert({hello: 'world'}, {safe:true}, green);
});


	dbclient.open(green);
	var a = red();
	client.collection('test_insert', green);
	a = red();
	var collection = a[1];
	collection.insert({a:2}, green);
	a = red();
	var docs = a[1];
	collection.find().toArray(green);
	a = red();
	var results = a[1];
	test.	

    test = function (err, collection) {
      collection.insert({a:2}, function(err, docs) {

        // Locate all the entries using find
        collection.find().toArray(function(err, results) {
          test.assertEquals(1, results.length);
          test.assertTrue(results.a === 2);

          // Let's close the db
          client.close();
        });
      });
    };

client.open(function(err, p_client) {
  client.collection('test_insert', test);
});
