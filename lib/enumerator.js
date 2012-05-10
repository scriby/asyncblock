var Fiber = require('fibers');
var Flow = require('./flow.js').Flow;

var Enumerator = function(exec){
    this.exec = exec;
    this.curr = null;
};

Enumerator.prototype.__defineGetter__('current', function(){
    return this.curr;
});

var undef = (function(){})();
Enumerator.prototype.moveNext = function(){
    this.curr = this.exec();

    return this.curr !== undef;
};

Flow.prototype.yield = function(value){
    if(!this._isGenerator){
        throw new Error("flow.yield may only be called from an asyncblock.generator");
    }

    if(this.listeners('yield').length > 0){
        this.emit('yield', value);
    } else {
        Fiber.yield(value);
    }
};

exports.getEnumerator = function(flow, fiber){
    //THe generator is initially stopped
    flow._light = false;

    var runFiber = fiber.run.bind(fiber);

    var run = function(){
        //Fiber is done generating
        if(fiber != null){
            return runFiber();
        }
    };

    var enumerator = function(){
        //Async generator support
        if(Fiber.current != null){
            var outerFlow = Fiber.current._asyncblock_flow;

            var key = flow._getNextTaskId();

            var resume = outerFlow.add({key: key, dontWait: true});
            var callback = function(value){
                resume(null, value);
            };

            flow.on('yield', callback);

            //If the generator doesn't end up generating anything, we don't want to wait forever
            flow.on('end', callback);

            //We need to delay the running of the generator in case it returns results without blocking
            process.nextTick(function(){
                if(!flow._light){
                    run();
                }
            });

            var result = outerFlow.wait(key);

            flow.removeListener('end', callback);
            flow.removeListener('yield', callback);

            return result;
        } else {
            return run();
        }
    };

    enumerator.__proto__ = new Enumerator(enumerator);

    return enumerator;
};
