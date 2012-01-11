```
                                        ______  ______              ______  
______ ______________  _________ __________  /_ ___  /______ __________  /__
_  __ `/__  ___/__  / / /__  __ \_  ___/__  __ \__  / _  __ \_  ___/__  //_/
/ /_/ / _(__  ) _  /_/ / _  / / // /__  _  /_/ /_  /  / /_/ // /__  _  ,<   
\__,_/  /____/  _\__, /  /_/ /_/ \___/  /_.___/ /_/   \____/ \___/  /_/|_|  
                /____/                                                      

```
==================================================================

A fully fledged flow control library built on top of fibers.

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

## Overview

Check out the [overview](https://github.com/scriby/asyncblock/blob/master/docs/overview.md) to get an at-a-glance overview
of the different ways asyncblock can be used.

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
    
    fs.readFile(path5, 'utf8', flow.set('contents1')); //get & set can be used instead of add & wait
    fs.readFile(path6, 'utf8', flow.set('contents2'));
    console.log(flow.get('contents2'); //Passing a key to flow.get will wait on just that task
    var contents1 = flow.get('contents1');
    
    fs.readFile(path7, 'utf8', flow.add('firstFile'));
    fs.readFile(path8, 'utf8', flow.add('secondFile'));
    fs.writeFile(path9, 'utf8', flow.wait('firstFile') + flow.wait('secondFile'); //Write the combined contents. Keys can also be passed to wait.
    flow.wait(); //Wait for the combined contents to be written to a third file

    var contents = flow.sync(fs.readFile, path10, 'utf8'); //flow.sync is a shorthand for a single task that should be waited on immediately
    console.log(contents);
    
    //flow.func syntax new in 1.4
    var contents = flow.func(fs.readFile)(path11, 'utf8'); //Same as previous example
    console.log(contents);
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

### Wrapping existing async modules

You may wrap existing async modules to provide a syncronous wrapper which may be used within an asyncblock. This style
may be used instead of or in addition to flow.add & flow.wait.

```javascript
var asyncblock = require('asyncblock');
var fs = asyncblock.wrap(require('fs'));

asyncblock(function(flow){
    var fileContents = fs.sync.readFile(path, 'utf8');//Preface the function name with .sync, and leave off the callback
    console.log(fileContents);
    
    var future1 = fs.future.readFile(path1, 'utf8'); //Use futures to achieve parallel execution
    var future2 = fs.future.readFile(path2, 'utf8');
    console.log(future1.result + future2.result); //When .result is called, execution yields (event loop not blocked)
});
```

See the API docs for more information.

## API

See [API documentation](https://github.com/scriby/asyncblock/blob/master/docs/api.md)

## Stack traces

See [stack trace documentation](https://github.com/scriby/asyncblock/blob/master/docs/stacktrace.md)

## Error handling

See [error handling documentation](https://github.com/scriby/asyncblock/blob/master/docs/errors.md)

## Formatting results

See [formatting results documentation](https://github.com/scriby/asyncblock/blob/master/docs/results.md)

## Parallel task rate limiting

See [maxParallel documentation](https://github.com/scriby/asyncblock/blob/master/docs/maxparallel.md)

## Task timeouts

See [timeout documentation](https://github.com/scriby/asyncblock/blob/master/docs/timeout.md)

## Concurrency

Both fibers, and this module, do not increase concurrency in nodejs. There is still only one thread. It just changes
how the code can be written to manage the asynchronous control flow.

## Risks

* Fibers are fast, but they're not the fastest. CPU intensive tasks may prefer other solutions (you probably don't want to do CPU intensive work in node anyway...)
* Not suitable for cases where a very large number are allocated and used for an extended period of time ([source](http://groups.google.com/group/nodejs/browse_thread/thread/ddd6e2756f1f4d8c/164f8f34d8261fdb?lnk=gst&q=fibers#164f8f34d8261fdb))
* It requires V8 extensions, which are maintained in the node-fibers module
     * In the worst case, if future versions of V8 break fibers support completely, a custom build of V8 would be required
     * In the best case, V8 builds in support for coroutines directly, and asyncblock becomes based on that
* When new versions of node (V8) come out, you may have to wait longer to upgrade if the fibers code needs to be adjusted to work with it

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