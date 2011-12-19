```
                                        ______  ______              ______  
______ ______________  _________ __________  /_ ___  /______ __________  /__
_  __ `/__  ___/__  / / /__  __ \_  ___/__  __ \__  / _  __ \_  ___/__  //_/
/ /_/ / _(__  ) _  /_/ / _  / / // /__  _  /_/ /_  /  / /_/ // /__  _  ,<   
\__,_/  /____/  _\__, /  /_/ /_/ \___/  /_.___/ /_/   \____/ \___/  /_/|_|  
                /____/                                                      

```


==================================================================

A fork of [node-green-light](https://github.com/axkibe/node-green-light) with parallel execution support and some other goodies.

###Installation

```javascript
npm install asyncblock
```

See [node-fibers](https://github.com/laverdet/node-fibers) for more information, especially if you're running on node < v0.5.2.

### Why should I use asyncblock?

* Write async code in synchronous style without blocking
* Effortlessly combine synchronous and parallel operations with minimal boilerplate
* Produce code which is easier to read, reason about, and modify
* Improve debugging by not losing stack traces across async calls

### Why should I not use asyncblock?

* Fibers are fast, but they're not the fastest. CPU intensive tasks may prefer other solutions (you probably don't want to do CPU intensive work in node anyway...)
* It requires V8 extensions, which are maintained in the node-fibers module
 
### Sample

A sample program in pure node, using the async library, and using asyncblock + fibers.

### Pure node

```javascript

function example(callback){
    var finishedCount = 0;
    var fileContents = [];

    var continuation = function(){
        if(finishedCount < 2){
            return;
        }

        fs.writeFile('path3', fileContents[0], function(err) {
            if(err) {
                throw new Error(err);
            }

            fs.readFile('path3', 'utf8', function(err, data){ 
                console.log(data);
                console.log('all done');
            });
        });
    };

    fs.readFile('path1', 'utf8', function(err, data) {
        if(err) {
            throw new Error(err);
        }

        fnishedCount++;
        fileContents[0] = data;

        continuation();
    });

    fs.readFile('path2', 'utf8', function(err, data) {
        if(err) {
            throw new Error(err);
        }

        fnishedCount++;
        fileContents[1] = data;

        continuation();
    });
}
```

### Using async

```javascript

var async = require('async');

var fileContents = [];

async.series([
    function(callback){
        async.parallel([
            function(callback) {
                fs.readFile('path1', 'utf8', callback);
            },

            function(callback) {
                fs.readFile('path2', 'utf8', callback);
            }
        ],
            function(err, results){
                fileContents = results;                                    
                callback(err);
            }
        );
    },

    function(callback) {
        fs.writeFile('path3', fileContents[0], callback);
    },

    function(callback) {
        fs.readFile('path3', 'utf8', function(err, data){
            console.log(data);
            callback(err);
        });
    }
],
    function(err) {
        if(err) {
            throw new Error(err);
        }
        
        console.log('all done');
    }
);
```

### Using asyncblock + fibers

```javascript

var asyncblock = require('asyncblock');

asyncblock(function(flow){
    fs.readFile('path1', 'utf8', flow.add('first'));
    fs.readFile('path2', 'utf8', flow.add('second'));

    var fileContents = flow.wait();
    
    fs.writeFile('path3', fileContents.first, flow.add());
    flow.wait();

    fs.readFile('path3', 'utf8', flow.add());
    var data = flow.wait();

    console.log(data);
    console.log('all done');
});
```

## Notes

### flow.add and flow.wait

Pass the result of flow.add() as a callback to asynchronous functions. Each usage of flow.add() will run in parallel.
Call flow.wait() when you want execution to pause until all the asynchronous functions are done.

You may pass a key to flow.add, which will be used when getting the result from flow.wait. For example, calling
flow.add('key1') and flow.add('key2') would produce a result { key1: value1, key2: value2 }. It is not necessary to
pass a key to flow.add if you do not need to get the result.

If there is only one call to flow.add and no key is passed, the result will be returned as is without the object wrapper.

If any of the asynchronous callbacks pass an error as the first argument, it will be thrown as an exception by asyncblock.
You only receive from the 2nd arg on from the flow.wait call. If more than one parameter was passed to the callback,
it will be returned as an array.

## Keeping the stack trace

To maintain the stack trace across async calls, the only thing you have to do is use an Error object (instead of a string)
when calling a callback with an error.

For example:

```javascript
    var asyncTask = function(callback) {
        process.nextTick(function() {
            callback(new Error('An error occured')); //Line 130
        });
    };

    asyncblock(function(flow) {
        asyncTask(flow.add());
        flow.wait(); //Line 136
    });
```

Stack trace:

```javascript
Error: An error occured
    at Array.0 (.../sourcecode/asyncblock/test2.js:130:18) //<-- Error callback
    at EventEmitter._tickCallback (node.js:192:40)
=== Pre-async stack ===
Error
    at .../sourcecode/asyncblock/asyncblock.js:71:67
    at .../sourcecode/asyncblock/asyncblock.js:90:9
    at Object.wait (.../sourcecode/asyncblock/asyncblock.js:109:27)
    at .../sourcecode/asyncblock/test2.js:136:10  //<-- The original call to flow.wait()
    at .../sourcecode/asyncblock/asyncblock.js:12:4

```

## Error handling

The easiest way to do error handling with asyncblock is to always set flow.errorCallback to be the current function's callback.
If errorCallback is set, Errors which are thrown within the asyncblock will be passed to the callback and will not bubble
up the call stack. This can help guard against bugs in libraries which don't properly account for exceptions getting thrown
from user code.

If errorCallback is not set, the error will be re-thrown and bubble up the call stack.

Here are some examples to illustrate the error handling behavior:

```javascript
var callback = function(err){
    console.log('cb');

    if(err) {
        console.log(err);
    }
};

var callbackThrowError = function(err){
    console.log('cb throw error');

    if(err) {
        console.log(err);
    } else {
        throw new Error('callback error');
    }
};

process.on('uncaughtException', function(err) {
    console.log('uncaught');
    console.log(err);
});

var asyncThrow = function(callback){
    setTimeout(function(){
        try{
            throw new Error('async');
        } finally {
            callback();
        }
    }, 1000);
};

var asyncError = function(callback){
    callback('asyncError');
};

var asyncTickError = function(callback){
    process.nextTick(function(){
        callback('asyncError');
    });
};
```

```javascript
asyncblock(function(flow){
    flow.errorCallback = callback;

    asyncTickError(flow.add());
    flow.wait();

    console.log('here');

    callback();
});

/* Prints
cb
asyncError
*/
```

```javascript
asyncblock(function(flow){
    asyncTickError(flow.add());
    flow.wait();

    console.log('here');

    callback();
});

/* Prints
uncaught
[Error: asyncError]
*/
```

```javascript
asyncblock(function(flow){
    flow.errorCallback = callback;

    asyncThrow(flow.add());
    flow.wait();

    console.log('here');

    callback();
});

/* Prints
here
cb
uncaught
[Error: async]
*/
```

The above case is interesting as an uncaught Error is thrown from within the setTimeout call. This Error bubbles up
a separate call stack, so it does not prevent the rest of the current flow from executing. Note that there is no way
to catch that exception from the asyncblock.

```javascript
asyncblock(function(flow){
    flow.errorCallback = callbackThrowError;

    callbackThrowError();

    console.log('here');
});

/* Prints
cb throw error
cb throw error
[Error: callback error]
*/
```

The above example illustrates what happens if the callback itself throws an error. The Error will get caught by the
async block, then passed back to the callback as the error parameter. In this way, it's possible that the callback could
get called twice, so it's important to have the callback not proceed if an error occured.

Note that asyncblock will call the errorCallback only on the first error.

## Concurrency

Both fibers, and this module, do not increase concurrency in nodejs. There is still only one thread. It just changes
how the code can be written to manage the asynchronous control flow.

## Some more examples

```javascript
asyncblock(function(flow){
    console.time('time');

    setTimeout(flow.add(), 1000);
    flow.wait();

    setTimeout(flow.add(), 2000);
    flow.wait();

    console.timeEnd('time'); //3 seconds
});
```

```javascript
asyncblock(function(flow){
    console.time('time');

    setTimeout(flow.add(), 1000);
    setTimeout(flow.add(), 2000);
    flow.wait();

    console.timeEnd('time'); //2 seconds
});
```