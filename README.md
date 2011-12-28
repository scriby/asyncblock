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

* Write async code in synchronous style without blocking the event loop
* Effortlessly combine serial and parallel operations with minimal boilerplate
* Produce code which is easier to read, reason about, and modify
    * Compared to flow control libraries, asyncblock makes it easy to share data between async steps. There's no need to create variables in an outer scope or use "waterfall".
* Simplify error handling practices
    * If an error occurs in an async step, automatically call your callback with the error, or throw an Error
* Improve debugging by not losing stack traces across async calls
    * Line numbers don't change. What's in the stack trace maps directly to your code (You may lose this with CPS transforms)
    * If using a debugger, it's easy to step line-by-line through asyncblock code (compared to async libraries)

### What are the risks?

* Fibers are fast, but they're not the fastest. CPU intensive tasks may prefer other solutions (you probably don't want to do CPU intensive work in node anyway...)
* Not suitable for cases where a very large number are allocated and used for an extended period of time ([source](http://groups.google.com/group/nodejs/browse_thread/thread/ddd6e2756f1f4d8c/164f8f34d8261fdb?lnk=gst&q=fibers#164f8f34d8261fdb))
* It requires V8 extensions, which are maintained in the node-fibers module
     * In the worst case, if future versions of V8 break fibers support completely, a custom build of V8 would be required
     * In the best case, V8 builds in support for coroutines directly, and asyncblock becomes based on that
* When new versions of node (V8) come out, you may have to wait longer to upgrade if the fibers code needs to be adjusted to work with it 

## Examples

A few quick examples to show off the functionality of asyncblock:

### Sleeping in series

```javascript
asyncblock(function(flow){
    console.time('time');

    setTimeout(flow.add(), 1000);
    flow.wait(); //Wait for the first setTimeout to finish

    setTimeout(flow.add(), 2000);
    flow.wait(); //Wait for the second setTimeout to finish

    console.timeEnd('time'); //3 seconds
});
```

### Sleeping in parallel

```javascript
asyncblock(function(flow){
    console.time('time');

    setTimeout(flow.add(), 1000);
    setTimeout(flow.add(), 2000);
    flow.wait(); //Wait for both setTimeouts to finish

    console.timeEnd('time'); //2 seconds
});
```

### Trapping results

```javascript
asyncblock(function(flow) {
    fs.readFile(path1, 'utf8', flow.add('firstFile')); //Store the result of the first read under the key "firstFile"                                        
    fs.readFile(path2, 'utf8', flow.add('secondFile')); //Store the result of the second read under the key "secondFile"
    var files = flow.wait(); //Both file reads are running in parallel. Wait for them to finish.
    
    
    fs.writeFile(path3, 'utf8', files.firstFile + files.secondFile);
    flow.wait(); //Wait for the combined contents to be written to a third file
    
    
    fs.readFile(path4, 'utf8', flow.add()); //If no key is passed...
    var contents = flow.wait(); //That object will get returned by the flow.wait call
    console.log(contents);

    
    fs.readFile(path5, 'utf8', flow.add('contents1'));
    fs.readFile(path6, 'utf8', flow.add('contents2'));
    console.log(flow.wait('contents2'); //Passing a key to flow.wait will wait on just that task
    var contents1 = flow.wait('contents1'); //Wait on the result of contents2 first, then contents1
    
    
    fs.readFile(path7, 'utf8', flow.add('firstFile'));
    fs.readFile(path8, 'utf8', flow.add('secondFile'));
    fs.writeFile(path9, 'utf8', flow.wait('firstFile') + flow.wait('secondFile'); //Equivalent to first example, but more concise
    flow.wait(); //Wait for the combined contents to be written to a third file

});
```

### Error handling

```javascript
var asyncTask = function(callback) {
    asyncblock(function(flow) {
        flow.errorCallback = callback; //Setting the errorCallback is the easiest way to perform error handling. If erroCallback isn't set, and an error occurs, it will be thrown instead of returned to the callback
        
        fs.readFile(path, 'utf8', flow.add()); //If readFile encountered an error, it would automatically get passed to the callback
        var contents = flow.wait();
        
        console.log(contents); //If an error occured above, this code won't run
    });
});
```

## flow.add and flow.wait

Pass the result of flow.add() as a callback to asynchronous functions. All the code you call before calling flow.wait
will run in parallel. When flow.wait is called, execution pauses until all the asynchronous functions are done. Note
that the event loop does not pause -- other tasks in node will continue to execute as if you were making an async call.

You may pass a key to flow.add, which can be used to get the result from flow.wait. For example, calling
flow.add('key1') and flow.add('key2') would produce a result { key1: value1, key2: value2 }. It is not necessary to
pass a key to flow.add if you do not need to get the result, or if there is only one result.

If there is only one call to flow.add and no key is passed, the result will be returned as is without the object wrapper.

If an error occured in one of the async calls, code execution will stop at that point. The error handling behavior depends
on whether flow.errorCallback was set. See the error handling section for more information.

When getting results from the flow.wait call, all but the first argument (the error) will be provided. 
If more than one parameter was passed to the callback, it will be returned as an array (see formatting section for more details).

## Passing a key to flow.wait

New in 0.8.0, you can pass a key to flow.wait to wait on a specific operation. This gives you even more flexibility to
create intricate control flows easily. Here's an example of starting to read 4 files, then taking an action when 2 of 
them are finished:

```javascript
asyncblock(function(flow){
   fs.readFile(path1, 'utf8', flow.add(1));                                           
   fs.readFile(path2, 'utf8', flow.add(2));
   fs.readFile(path3, 'utf8', flow.add(3));
   fs.readFile(path4, 'utf8', flow.add(4));
       
   console.log(flow.wait(1) + flow.wait(2)); //The fiber will yield here until 1 & 2 are finished
       
   console.log(flow.wait(4)); //THe fiber will yield here until 4 is done
       
   if(flow.wait(3) === 'asdf') { //The fiber will yield here until 3 is done
       console.log("3's contents are equal to asdf");                                               
   }
});
```

Once you get the result for a key, it will no longer be retrievable. If you request the same key twice, asyncblock will
wait for another task with that key to be run.

Something like this is also perfectly valid:

```javascript
asyncblock(function(flow){
    process.nextTick(function(){
        fs.readFile(path, 'utf8', flow.add('file')); //Add the "file" task here, asynchronously in a different "call stack"
    });
    
    var fileContents = flow.wait('file'); //Wait here until a task named "file" is added and finished at some point in the future
});
```

## Keeping the stack trace

To maintain the stack trace across async calls, you don't have to do anything special. Note that callbacks which receive
an error will have the first argument converted into an actual Error object (for example, if a string was passed).
Thrown Errors will automatically get the previous stack trace appended to the stack.

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

## Formatting results

When more than one parameter is passed from an asynchronous function's callback, it is converted to an array:

```javascript
    var asyncTask = function(callback) {
        process.nextTick(function() {
            callback(null, 1, 2, 3);
        });                                    
    }
    
    asyncblock(function(flow) {
        asyncTask(flow.add());
        
        var result = flow.wait();
        console.log(result); // Prints [1, 2, 3]
    });
```

In some cases, it may be desirable to add some more structure to the result:

```javascript
var asyncTask = function(callback) {
    process.nextTick(function() {
        callback(null, 1, 2, 3);
    });
};

asyncblock(function(flow) {
    asyncTask(flow.add(['first', 'second', 'third']));

    var result = flow.wait();
    console.log(result); // Prints { first: 1, second: 2, third: 3 }

    asyncTask(flow.add('key1', ['first', 'second', 'third']));
    asyncTask(flow.add('key2', ['a', 'b', 'c']));
    var result = flow.wait();
    console.log(result); // Prints { key1: { first: 1, second: 2, third: 3 }, key2: { a: 1, b: 2, c: 3} }
});
```

When calling flow.add, you may pass a format array conditionally. If provided, it will be used to build an object bag
when returning the results to flow.wait.

## Parallel task rate limiting

In some cases, you may want to run tasks in parallel, but not all of them at once. For example, consider the case of 
uploading a large number of files to a remote server. Keeping some number of uploads going at once would be a good solution.
Setting flow.maxParallel makes this easy:

```javascript
asyncblock(function(flow){
    flow.maxParallel = 10;
    
    for(var i = 0; i < files.length; i++) {
        uploadFile(files[i], flow.add());
    }
    
    flow.wait(); //Wait for all uploads to finish
});
```

When flow.add is called, if 10 or more uploadFile calls have not executed their callbacks yet, 
execution will yield until one of the callbacks is fired. As soon as the callback is fired, the flow.add call will
return and the code in the asyncblock will continue to execute. In this way, there will always be a "pool" of 10
uploads executing, until fewer than 10 tasks remain. The final tasks are waited on by the final flow.wait call.

## Task timeouts

New in 0.9.0, you may specify the amount of time you want to wait for any single task in an asyncblock by setting flow.taskTimeout to
the desired number of milliseconds. If a task takes longer than the taskTimeout, an error will be raised in a similar way
as if the async task itself had returned an error.

When a timeout occurs, the actual task itself cannot automatically be aborted. To perform cleanup manually, you may
attach to the flow.on('taskTimeout') event source. Here is an example:

```javascript
var asyncTask = function(callback) {
    asyncblock(function(flow){
        flow.errorCallback = callback;
        flow.taskTimeout = 1000; //Wait up to 1 second for each task to complete in this block
        flow.on('taskTimeout', function(info) {
            //Perform cleanup here for the task that timed out (close sockets, file handles, etc.)                                    
            console.log('Task ' + info.key + ' timed out after running for ' + info.runtime + 'ms');                                        
        });
        
        setTimeout(flow.add('timer'), 2000); //Add a task that takes 2 seconds to complete
        flow.wait();
        
        //Code here will not run
    });
});
```

To add a timeout for just a single task, use the alternate add syntax:

```javascript
asyncblock(function(flow){
    setTimeout(flow.add({key: 'timer', timeout: 1000}, 2000);
    flow.wait();
    
    //Code here will not run
});
```

Note that timeout can be used in conjunction with ignoreError. This is a dangerous as other errors would be ignored as well.

```javascript
asyncblock(function(flow){
    setTimeout(flow.addIgnoreError({key: 'timer', timeout: 1000}, 2000);
    flow.wait(); //The fiber will yield here for 1 second, then continue
    
    //Code here will run
});
```

A better way to not treat timeouts as errors (new in 0.9.2):

```javascript
asyncblock(function(flow){
    setTimeout(flow.add({timeout: 1000, timeoutIsError: false}, 2000);
    flow.wait(); //The fiber will yield here for 1 second, then continue
    
    //Code here will run
});
```

Or,

```javascript
asyncblock(function(flow){
    flow.timeoutIsError = false;
    
    setTimeout(flow.add({timeout: 1000}, 2000);
    flow.wait(); //The fiber will yield here for 1 second, then continue
    
    //Code here will run
});
```

Even if timeoutIsError is set to false, the taskTimeout event will still be emitted. Also, flow.wait will return undefined
for the tasks that timed out.

### Usage with queue

A timeout may be explicitly defined on a queue call with the following syntax:

```javascript
asyncblock(function(flow){
    flow.queue({ key: 'timer', timeout: 1000, timeoutIsError: false}, function(callback){
        setTimeout(callback, 2000);
    });
    
    flow.wait(); //The fiber will yield here for 1 second, then continue
    
    //Code here will run
});
```

## Adding tasks asynchronously

Version 0.7 adds the ability to add tasks asynchronously. Consider the following example:

```javascript

asyncblock(function(flow) {
    process.nextTick(function(){
        setTimeout(flow.add(), 1000);
    });                                        
    
    flow.wait();
});

```

In the above example, the flow.wait call is executed before the flow.add call, so asyncblock thinks there's nothing to wait on,
and exits. We can handle this case by using flow.forceWait and flow.doneAdding:

```javascript
asyncblock(function(flow) {
    process.nextTick(function(){
        setTimeout(flow.add(), 1000);
        
        flow.doneAdding();
    });                                        
    
    flow.forceWait();
});
```

The forceWait call will make the fiber yield, even if it's not waiting on anything. This can give asynchronous operations
a chance to add tasks later on. But, we have to let asyncblock know when we're done adding tasks, or it will just wait forever.
It's important not to forget to call doneAdding when using forceWait, or the fiber won't get cleaned up.

## You can't wait from outside the fiber

flow.wait and flow.forceWait can only be called from within the "call stack" that is running within the asyncblock.
Check out this example:

```javascript
asyncblock(function(flow) {
   process.nextTick(function(){
       setTimeout(flow.add(), 1000);
       flow.wait(); // This doesn't work
       
       flow.doneAdding();
   });
   
   flow.forceWait();
});
```

It seems like something like that might be able to work. Note that this doesn't just apply to process.nextTick, it
applies to any case where there is code executing from a "call stack" that's outside the fiber -- for example, in
an event callback from a file or stream reader.

The reason it doesn't work is that the code running in the nextTick originated from a different "call stack", so it's not
running in a fiber. When calling wait, it's impossible for that code to yield, because it wasn't running in a fiber to
begin with. The only code running in a fiber is the contents of the function defined in the asyncblock. So, that's the
only place from which we can call wait.

Note that this works:

```javascript
asyncblock(function(flow) {
   process.nextTick(function(){
       asyncblock(function(innerFlow){
           setTimeout(innerFlow.add(), 1000); 
           innerFlow.wait(); //Wait on the setTimout call
           
           flow.doneAdding(); //Tell the outer fiber that it can stop waiting
       });
   });
   
   flow.forceWait(); //Forcewait gets called first
});
```

## flow.queue

In 0.7, a new function called flow.queue was added. It differs slightly in usage from flow.add. Here is a simple example:

```javascript
asyncblock(function(flow) {
   flow.queue(function(callback) {
       setTimeout(callback, 1000);
   });                                     
   
   flow.wait(); //This will wait for about a second
});
```

Note that the above example is equivalent to this:

```javascript
asyncblock(function(flow){
    setTimeout(flow.add(), 1000);
    flow.wait();
});
```

The difference is the order of execution. In the second example, the setTimeout call will start immediately, then flow.wait
is called. In the first example, the asyncblock gets control over when to run the queued function. This turns out to be
important when using maxParallel in conjunction with functions added within an async callback.

Consider this example:

```javascript
asyncblock(function(flow) {
   flow.maxParallel = 2;
   
   process.nextTick(function(){
       //This "call stack" is not running within the fiber
       setTimeout(flow.add(), 1000);
       setTimeout(flow.add(), 2000);
       setTimeout(flow.add(), 3000); // Error!
   
       flow.doneAdding();   
   });
   
   flow.forceWait();                                        
});
```

So, what's the problem? When flow.add is called, if the number of max parallel operations has been exceeded (2 in this case),
the current fiber will yield until one of the operations is complete. However, because the code is running from within
the nextTick, there is no current fiber, so an error is thrown on the third flow.add call.

To work around the issue, you can use flow.queue:

```javascript
asyncblock(function(flow) {
   flow.maxParallel = 2;
   
   process.nextTick(function(){
       flow.queue(function(callback) {
           setTimeout(callback, 1000);                                    
       });
       
       flow.queue(function(callback) {
           setTimeout(callback, 2000);                                    
       });
       
       flow.queue(function(callback) {
           setTimeout(callback, 3000);                                    
       });
       
       flow.doneAdding();   
   });
   
   flow.forceWait();                                        
});
```

The above example will work, and should take about 4 seconds (The first two will run in parallel. When the first finishes,
the third one will start). This example works, because the queued operations are stored up until control returns to the 
fiber, so the yielding will work properly.

Note that the arguments to flow.queue are the same as flow.add, except that the last argument is the function to
execute. The first two arguments (key & response format) are optional.

When adding flow.queue, an alias for flow.add was created called flow.callback. You may find it easier to distinguish
the behavior of the two:

```javascript
asyncblock(function(flow) {
    setTimeout(flow.callback(), 1000);
    
    flow.queue(function(callback) {
        setTimeout(callback, 1000);                                        
    });
    
    flow.wait();
});
```

## Ignoring errors

What if you don't care if an error occurs in a particular step? New in 0.7.5, you may use addIgnoreError or queueIgnoreError.

```javascript
asyncblock(function(flow){
    fs.writeFile('path', 'utf8', contents, flow.addIgnoreError());                                        
    flow.wait();
    
    //This code will continue to run even if writeFile encountered an error
});
```

```javascript
asyncblock(function(flow){
    flow.queueIgnoreError(function(callback){
        fs.writeFile('path', 'utf8', contents, callback);                                        
    });
    flow.wait();
    
    //This code will continue to run even if writeFile encountered an error
});
```

Just as flow.callback is an alias for flow.add, flow.callbackIgnoreError is an alias for flow.addIgnoreError.

## Concurrency

Both fibers, and this module, do not increase concurrency in nodejs. There is still only one thread. It just changes
how the code can be written to manage the asynchronous control flow.

## Compared to other solutions...

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
    
    fs.writeFile('path3', flow.wait('first'), flow.add()); //Wait until done reading the first file, then write it to another file
    flow.wait(); //Wait on all outstanding tasks

    fs.readFile('path3', 'utf8', flow.add('data'));

    console.log(flow.wait('data')); //Print the 3rd file's data
    console.log('all done');
});
```

### No prototypes were harmed in the making of this module