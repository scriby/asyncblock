var Flow = require('./flow.js').Flow;

var Future = function(flow, key){
    this._flow = flow;
    this._key = key;

    this._result = null;
    this._resultObtained = false;
};

Future.prototype.__defineGetter__("result", function(){
    if(this._resultObtained === false){
        this._result = this._flow.wait(this._key);
        this._resultObtained = true;
    }

    return this._result;
});

Flow.prototype.future = function(options){
    if(arguments.length === 1 && Object.prototype.toString.call(options) !== '[object Object]'){
        //flow.future(asyncFunction(..., flow.add()); usage
        var lastTask = this._lastAddedTask;

        if(lastTask == null){
            throw new Error('flow.future usage not correct -- no task has been added');
        }

        //If the callers don't match, they added a task inside the function call, and we're going to assume the wrong task
        if(lastTask.caller !== this.future.caller){
            throw new Error('flow.future usage not correct - you may not add more tasks in a nested function');
        }

        return new Future(this, lastTask.key);
    } else {
        //var future = flow.future();
        //asyncFunction(..., flow.future()); usage
        var task = this._parseAddArgs(arguments);
        task.key = this._getNextTaskId();
        task.dontWait = true;

        this._addTask(task);

        var callback = function(){
            task.callback.apply(null, arguments);
        };

        callback.__proto__ = new Future(this, task.key);

        return callback;
    }
};

exports.Future = Future;
