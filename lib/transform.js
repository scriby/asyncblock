var mod = require('module').prototype;
var originalCompile = mod._compile;

var esprima = require('esprima');

var enabled = false;

var isInAsyncblock = function(node, asyncblockVarName){
    if(asyncblockVarName == null){
        return false;
    }

    var parent = node;
    while(parent !== null){
        if(parent.callee && parent.callee.name === asyncblockVarName) {
            return true;
        }

        parent = parent._parent;
    }

    return false;
};

var getArgsContent = function(args, content){
    return content.substring(args[0].range && args[0].range[0], args[args.length - 1].range && args[args.length - 1].range[1]);
};

var getGrandfather = function(node){
    return node._parent && node._parent._parent;
};

var recursiveWalk = function(node, parent, handlers){
    var func = handlers[node.type];
    node._parent = parent;
    if(func){
        func(node);
    }

    Object.keys(node).forEach(function(key){
        if(key === '_parent'){
            return;
        }

        var prop = node[key];

        if(Array.isArray(prop)){
            prop.forEach(function(prop){
                if(prop && prop.type){
                    recursiveWalk(prop, node, handlers);
                }
            });
        } else {
            if(prop && prop.type){
                recursiveWalk(prop, node, handlers);
            }
        }
    });
};

exports.compileContents = function(content){
    var ast = esprima.parse(content, { range: true });
    //console.log(JSON.stringify(ast, null, '  '));

    var _asyncblockVarName;
    var asyncblocks = [];

    //Track locations of asyncblocks
    recursiveWalk(ast, null, {
        VariableDeclaration: function(node){
            if(_asyncblockVarName == null){
                for(var i = 0; i < node.declarations.length; i++){
                    var declaration = node.declarations[i];
                    var init = declaration.init;

                    if(init && init.type === 'CallExpression' &&
                       init.callee && init.callee.name === 'require' &&
                       init.arguments && init.arguments[0] && init.arguments[0].value === 'asyncblock'
                    ){
                        _asyncblockVarName = declaration.id && declaration.id.name;
                    }
                }
            }
        },

        CallExpression: function(node){
            if(_asyncblockVarName && node.callee && node.callee.name === _asyncblockVarName){
                asyncblocks.push(node);
            }
        },

        Identifier: function(node){
            if(node.name === 'sync'){
                var grandfather = getGrandfather(node);
                var parent = node._parent;

                if(grandfather && grandfather.type === 'CallExpression' && isInAsyncblock(node, _asyncblockVarName)){
                    var prevCallEnd = node._parent.object.range[1];
                    var chainedFuncArgs = parent.object.arguments;
                    var syncArgs = grandfather.arguments;

                    var syncArgsStr = getArgsContent(syncArgs, content);

                    var prefix = chainedFuncArgs.length > 0 ? ', ' : '';
                    var flowInsertion = prefix + 'flow.addAndReuseFiber(' + syncArgsStr + ')';
                    //var flowInsertionPosition = (chainedFuncArgs[chainedFuncArgs.length - 1].range || [])[1] || parent.object.range

                    //Add flow.sync closing paren
                    content = content.substring(0, grandfather.range[1]) + ' )' + content.substring(grandfather.range[1]);

                    //Take off the .sync()
                    content = content.substring(0, parent.range[1] - '.sync'.length) + content.substring(grandfather.range[1]);

                    //Add in flow.addAndReuseFiber()
                    content = content.substring(0, prevCallEnd - 1) + flowInsertion + content.substring(prevCallEnd - 1);

                    //console.log(content.substring(0, grandfather.range[0]) + 'flow.sync( ')
                    //Add flow.sync( before
                    content = content.substring(0, grandfather.range[0]) + 'flow.sync( ' + content.substring(grandfather.range[0]);
                }
            }
        }
    });

    return {
        content: content,
        transformed: true
    };
};

exports.enableTransform = function(){
    if(enabled){
        return false;
    } else {
        enabled = true;
    }

    mod._compile = function(content, filename) {
        var compileInfo = exports.compileContents(content, filename);

        if(compileInfo === false){
            //Didn't or couldn't compile the file
            return originalCompile.apply(this, arguments);
        } else {
            arguments[0] = compileInfo.content;
            this.__asyncblock_transformed = compileInfo.transformed;

            return originalCompile.apply(this, arguments);
        }
    };

    return true;
};