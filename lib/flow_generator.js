var util = require('util');
var Flow = require('./flow.js').Flow;

var GeneratorFlow = function(generator){
    this._generator = generator;

    Flow.call(this);
};

util.inherits(GeneratorFlow, Flow);

GeneratorFlow.prototype.canYieldAnywhere = false;

GeneratorFlow.prototype._start = function(){
    this._generator.next();
};

GeneratorFlow.prototype._resume = function(err, result){
    var res;

    if(err){
        if(this.errorCallback){
            this.errorCallback(err);
        } else {
            this._generator.throw(err);
        }

        return;
    } else {
        res = this._generator.next(result);
    }

    if(res.done){
        this._done && this._done(null, res.value);
    }
};

GeneratorFlow.prototype._taskFinished = function(task){
    this.emit('taskFinished', task);
};

GeneratorFlow.prototype._yield = function(){

};

GeneratorFlow.prototype._waitForAllTasks = function(){
    var self = this;

    this._runTaskQueue();

    if(!this._shouldYield()){
        //If the tasks all return before going async, they will already be done by this point
        //setImmediate is to prevent an error indicating the generator is already running
        setImmediate(function(){
            try{
                self._resume(null, self._formatResult());
            } catch(e){
                self._errorHandler(e);
            }
        });
        return;
    }

    var handler = function(task){
        self._runTaskQueue();

        if(self._shouldYield()){
            return; //Still waiting on other tasks
        }

        self.removeListener('taskFinished', handler);

        try{
            self._resume(null, self._formatResult());
        } catch(e){
            self._errorHandler(e);
        }
    };

    this.on('taskFinished', handler);
};

GeneratorFlow.prototype._waitForKey = function(key, preserveTask){
    var self = this;
    this._runTaskQueue();

    var handler = function(task){
        if(task.key === key){
            self.removeListener('taskFinished', handler);
            if(!preserveTask){
                delete self._finishedTasks[key];
            }

            self._resume(null, self._processSingleTaskResult(task));
        } else {
            self._runTaskQueue();
        }
    };

    if(this._finishedTasks.hasOwnProperty(key)){
        //Task finished synchronously before wait was called
        setImmediate(function(){
            handler(self._finishedTasks[key]);
        });

        return;
    }

    this.on('taskFinished', handler);
};

GeneratorFlow.prototype._onDoneAdding = function(){
    this._runTaskQueue();

    //All tasks may have finished before we call doneAdding
    //If that's the case, trigger the wait handler directly
    if(!this._shouldYield()){
        this.emit('taskFinished', {});
    }
};

GeneratorFlow.prototype._onQueueTask = function(){

};

GeneratorFlow.prototype._afterWaitForKey = function(){

};

GeneratorFlow.prototype._onAddTask = function(){

};

exports.GeneratorFlow = GeneratorFlow;
