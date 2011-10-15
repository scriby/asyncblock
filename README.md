node-green-light --- A very simple stop and go interace to node-fibers
======================================================================

This wrapper to node-fiber aims to ease calling existing asynchronous 
from a synchronous(fiber) context. A green-light-fiber gets two functions, 
one for pausing ('red light', 'pause', 'stop', 'yield') and one for resuming 
('green light', 'resume' 'go', 'run'). 

The resume() function is simply handed to asynchronous code as callback and 
the fiber then pauses() for it. This way all this pointers simply stay as 
they where. While using node-green-light produces a tad more code than other
synchronization wrappers it is easy and transparent.

The red function returns an array of all arguments passed to green (the callback).

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
