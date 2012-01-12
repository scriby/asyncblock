### flow.add([options], [key], [responseFormat])

* Options: An object bag containing:
    * ignoreError: If true, errors will be returned instead of calling the error handler / throwing. Default: false
    * key: A name (string or number) for the task. If provided, the result will be returned under this key in an object bag. Additionally, this task may be waited on specifically by name if a key is provided.
    * responseFormat: An array specifying names in the case that the async function returns multiple values in its callback. For example, the responseFormat ['a', 'b', 'c'] would convert a result of [1, 2, 3] to {a: 1, b: 2, c: 3}, so that the arguments may be referred to by name instead of by ordinal
    * timeout: Number of milliseconds to wait before aborting this task
    * timeoutIsError: If true (the default), a timeout is considered in error and will abort the current flow. If false, a timeout will not be treated as an error.
    * dontWait: If true, the result of this task will not be returned from flow.wait(). The result may only be obtained by passing a key to flow.wait.
* key: Same as if specified in options
* responseFormat: same as if specified in options

Pass the result of flow.add() as a callback to asynchronous functions, then use flow.wait() to wait on all added tasks or a single task. This is the most common way to use asyncblock.

See [add / wait documentation](https://github.com/scriby/asyncblock/blob/master/docs/addwait.md) for more details.

### flow.callback

Alias of flow.add

### flow.wait([key])

* key: The name (string or number) of a task to wait on. If not specified, all tasks are waited on.

If waiting by key on a single task, or waiting on a single task with no key, the result will be returned "raw". If flow.wait was called with no key, and waiting on a task with a key specified, the result will be of the form { key1: value1, key2: value2 }. If the task passes more than one parameter to the callback and no responseFormat is specified, only the second (first is error) will be returned.

### flow.set([options], key, [responseFormat])

Pass the result of flow.set(key) as a callback to asynchronous functions, then use flow.get() to wait for and get the result.

### flow.get(key)

Pass the key used in a previous flow.set call to get the result. If the result is not yet ready, the fiber will yield until it is ready.
Note that you may call flow.get(key) multiple times with the same key and it will return the stored result.

### flow.del(key)

Used to clear out stored results when using flow.set & flow.get. Not usually necessary, but provided for rare circumstances where
the garbage collector needs to collect results before the asyncblock ends.

### flow.func(toExecute)

Flow.func sets up a chained syntax which can be used to build a synchronous call in one line. The argument passed to flow.func is a function to execute, or a string representing a function name (in the case "self" is specified). The chain has the following functions available:

* self(thisObject) - Set the "this" context for the function being called
* options(objectBag) - Pass an options object bag, similar to when calling flow.add
* sync(args) - Executes the function immediately and returns the result. The fiber yields until the result is ready.
* future(args) - Returns a future which may be used to obtain the result of the function at some point in the future.
* queue(args) - Runs the task from the fiber as soon as possible. Get the result by making a call to flow.wait(key). If only one task has been queued (or added with flow.add()) with no key, you can get the result by calling flow.wait with no key.
* (arguments) - You may execute the result of flow.func (which is a function) at any time. You can also pass in the args here for simplicity.

Examples:

```javascript
asyncblock(function(flow){
    //Read the current file and store the results into contents (flow.func's simplest form)
    var contents = flow.func(fs.readFile)(__filename, 'utf8');

    //This is equivalent to the above example
    var contents = flow.func(fs.readFile).sync(__filename, 'utf8');

    //The following examples are all equivalent and show how to maintain the "this" context if necessary
    var custom1 = flow.func(obj.customAsyncMethod).call(obj, 'test');
    var custom2 = flow.func(obj.customAsyncMethod).apply(obj, ['test']);
    var custom4 = flow.func(obj.customAsyncMethod).self(obj)('test');
    var custom5 = flow.func('customAsyncMethod').self(obj).sync('test');

    //Read two files in parallel, then print the contents using queue
    flow.func(fs.readFile).args(path1, 'utf8').key('contents1').queue();
    flow.func(fs.readFile).args(path2, 'utf8').key('contents2').queue();
    console.log(flow.wait('contents1') + flow.wait('contents2'));

    //Read two files in parallel, then print the contents using futures
    var future1 = flow.func(fs.readFile).future(path1, 'utf8');
    var future2 = flow.func(fs.readFile).future(path2, 'utf8');
    console.log(future1.result + future2.result);
});
```

### flow.sync([options], toExecute, [extra args])

* options:
    * Same as add.options
    * self: A reference to the object to use as the "this" context when executing toExecute
* toExecute: An async function to execute, which takes a callback as the last argument
* extra args: Passed along to toExecute in order when called

A concise way to execute a single task and wait for the result. Note that flow.sync may only be called from the context of the original asyncblock. It cannot be called from async callbacks as those are not executing from within a fiber (flow.add & flow.queue can be called from async callbacks).

```javascript
asyncblock(function(flow){
    var contents = flow.sync(fs.readFile, path, 'utf8'); //Wait on only this result without blocking the event loop, then continue
    console.log(contents);
});
```

The above is equivalent to this:

```javascript
asyncblock(function(flow){
    fs.readFile(path, 'utf8', flow.add());
    var contents = flow.wait();
    console.log(contents);
});
```

And similar to this:

```javascript
asyncblock(function(flow){
    fs.readFile(path, 'utf8', flow.add('contents'));
    console.log(flow.wait('contents'));
});
```

### flow.queue([options], [key], [responseFormat], toExecute)

* Options, key, and responseFormat are the same as in flow.add
* toExecute: A function which is to be executed when control returns to the fiber

In general, there is little benefit to using flow.queue. The syntax is a little more verbose, and it requires the creation of another closure. The only time its use is required is when using flow.maxParallel and adding tasks asynchronously (from outside the fiber). More detail is in the readme.

As of 1.4.5, you can use the queue method of the flow.func chained syntax to achieve the same effect.

### flow.maxParallel

A property which can be set to limit the maximum number of tasks executing in parallel at once.

When using flow.maxParallel, you can not use flow.add to add tasks if doing so from outside the fiber (in an asynchronous callback). flow.queue (or flow.func's queue) must be used in this case. See the readme for more information.

### flow.errorCallback

If this property is set, errors which occur within the asyncblock (either thrown exceptions or errors passed to callbacks) will be passed to the specified function.

Setting this property is the preferred way to do error handling with asyncblock.

### flow.taskTimeout

A property indicating the number of milliseconds to wait for any single task within this asyncblock.

### flow.timeoutIsError

A property indicating whether a timeout should be treated as an error. If treated as an error, a timeout will cause the current flow to abort.

### asyncblock

```javascript
var asyncblock = require('asyncblock');

asyncblock(function(flow){
    //This code is running in a fiber. It may yield "in-place" without blocking the event loop
});
```

### asyncblock.nostack

When creating an asyncblock, the current stack is captured so it can be used to construct full stack traces if an error occurs.
This incurs a small performance penalty, but is generally worthwhile.

```javascript
var asyncblock = require('asyncblock');

asyncblock.nostack(function(flow){
    //If errors occur in here, they will get less detail added to their stack trace
});
```

### asyncblock.wrap(module)

Use asyncblock.wrap to create a synchronous wrapper for an existing async module.

```javascript
var asyncblock = require('asyncblock');
var fs = asyncblock.wrap(fs);

asyncblock(function(flow){
    var fileContents = fs.sync.readFile(path, 'utf8'); //Call the function like normal, but leave off the callback, and preface it with .sync
    console.log(fileContents); //Print the contents

    fs.readFile(path, 'utf8', flow.add('contents')); //You still have access to the original methods
    console.log(flow.wait('contents'));

    var future1 = fs.future.readFile(path1, 'utf8'); //Futures can be used to get parallel execution
    var future2 = fs.future.readFile(path2, 'utf8');

    console.log(future1.result + future2.result); //Print the contents of both files

    //You can pass options like this. All the options available when calling add are available here as well.
    //Options set on flow, like maxParallel, also take effect
    var contents = fs.syncOptions({ timeout: 1000 }).readFile(path, 'utf8');
    console.log(contents);

    var future = fs.futureOptions({ timeout: 1000}).readFile(path, 'utf8');
    console.log(future.result);
});
```

Warning: Don't attempt to call functions that aren't written in async style with this method, as it may result in a memory leak.