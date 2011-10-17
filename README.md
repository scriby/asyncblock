node-green-light --- A simple stop and go interface to node-fibers
==================================================================

This wrapper to [node-fibers](https://github.com/laverdet/node-fibers) aims to
ease calling existing asynchronous code from a synchronous context. A
greenlight fiber gets two functions, red and green.  The first is for pausing
the other for resumes. Call them anyway you like red/green, pause/resume,
stop/go etc..

Calling an asynchronous function is as simple as handing it the green function
as callback and calling the red function yourself to wait for green to be
called.  Red returns either one of the arguments passed to green, all arguments
as array or a table with the arguments (see below).

Since the call to the asynchronous function is almost standard, its this
pointer is unaffected too. Red and green must always be called in pairs,
red-green or green-red.  In some cases some asynchronous function might call
its callback before returning, so in that case a call to green before red is
valid and red will return immediatly without pause. 

While using node-green-light requires a tad more code than other
synchronization wrappers might need, this one is straight-forward and
transparent.

EXAMPLES
--------
A simple timeout:

```javascript
var greenlight = require('greenlight');

greenlight(function(pause, resume) {
	console.log('starting timer');
	setTimeout(resume, 2000); 
	pause();
	console.log('two seconds passed');
});
console.log('the main context does not pause');
```

Inserting an entry into a mongodb.

```
var mongodb    = require('mongodb');
var greenlight = require('greenlight');
var server     = new mongodb.Server('localhost', mongodb.Connection.DEFAULT_PORT, {});
var connector  = new mongodb.Db('test', server, {});

greenlight(function(red, green) {
	// comfort routine for the return values of almost all mongodb functions.
	connector.open(green);
	var client = red();
	client.collection('test_collection', green);
	var collection = red();
	collection.insert({hello: 'world'}, {safe:true}, green);
	red();
	client.close(green);
	red();
	console.log('all finished');
});
```

Interface
---------
The module exports one function returned by require. This functions creates a new red&green fiber.
```javascript
var greenlight = require('greenlight');```

For the rest of this documentation its called greenlight. Its one argument is a
function that will be called as the new red&green fiber. Its two parameters are
red and green. Again call them anyway you like.

```javascript
greenlight(function(red, green) {
	// code.
});
```

The call to green is simple and straightforward to resume a paused red&green
fiber (or cause the next call to red to return immediatly). The parameters
passed to green are parsed by red. 

By default red treats the first parameter as error condition and will throw it
if it equals to true. Otherwise it will return the second. Since this pattern
occurs most times in node.js API it has been chosen as default. 

However, you can tell red how to treat the arguments passed to green:

```javascript
/**
| This equals to the default behavior, first argument is 'err' and thrown if true. 
| Second shall be returned.
*/
red('!', '<');


/**
| Here the first argument to green is ignored, second it 'err', third return value.
*/
red(null, '!', '<');

/**
| Red returns all arguments passed to green as an array.
*/
red('#');

/**
| Red throws first argument if true, and returns a full array - including err
| at position 0.
*/
red('!', '#');


/**
| Red will return a table with the first argument stored in .foo and the second
| in .bar 
*/
red('foo', 'bar');
```
