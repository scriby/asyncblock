node-green-light --- A simple stop and go interace to node-fibers
=================================================================

This wrapper to node-fibers aims to ease calling existing asynchronous from a
synchronous context. A green-light-fiber gets two functions, red for pausing
and green for resuming.

Calling an asynchronous function is as simple as handing it the green function
as callback and calling the red function yourself to wait for the green to be
called.  The red function returns an array of all arguments passed to green
(the callback). As the call to the asynchronous function is mostly normal, the
this pointer is unaffected too.

While using node-green-light requires a tad more code than other
synchronization wrappers might need, this one is straight-forward and
transparent.

EXAMPLES
--------
A simple timeout:

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

Inserting an entry into a mongodb.

```
var mongodb    = require('mongodb');
var greenlight = require('./green-light');
var server     = new mongodb.Server('localhost', mongodb.Connection.DEFAULT_PORT, {});
var connector  = new mongodb.Db('test', server, {});

greenlight(function(red, green) {
	// comfort routine for the return values of almost all mongodb functions.
	var myRed = function() {
		var a = red();
		if (a[0]) { throw new Error('dberror '+a[0].message); };
		return a[1];
	}
	connector.open(green);
	var client = myRed();
	client.collection('test_collection', green);
	var collection = myRed();
	collection.insert({hello: 'world'}, {safe:true}, green);
	myRed();
	client.close(green);
	myRed();
	console.log('all finished');
});
```
