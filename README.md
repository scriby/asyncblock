```
                                        ______  ______              ______  
______ ______________  _________ __________  /_ ___  /______ __________  /__
_  __ `/__  ___/__  / / /__  __ \_  ___/__  __ \__  / _  __ \_  ___/__  //_/
/ /_/ / _(__  ) _  /_/ / _  / / // /__  _  /_/ /_  /  / /_/ // /__  _  ,<   
\__,_/  /____/  _\__, /  /_/ /_/ \___/  /_.___/ /_/   \____/ \___/  /_/|_|  
                /____/                                                      

```


==================================================================

A fork of [node-green-light](https://github.com/axkibe/node-green-light) with parallel execution support.

###Installation

```javascript
npm install asyncblock
```

See [node-fibers](https://github.com/laverdet/node-fibers) for more information, especially if you're running on node < v0.5.2.

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