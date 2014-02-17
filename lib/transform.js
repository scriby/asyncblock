var mod = require('module').prototype;
var originalCompile = mod._compile;

var esprima = require('esprima');

var enabled = false;

var getContainingAyncblock = function(node, asyncblockVarName){
    if(asyncblockVarName == null){
        return false;
    }

    var parent = node;
    while(parent !== null){
        if(parent.callee && parent.callee.name === asyncblockVarName) {
            return parent;
        }

        parent = parent._parent;
    }

    return false;
};

var getFlowVarName = function(node){
    return (node.arguments[0].params[0] || {}).name || '__asyncblock_flow';
};

var getArgsContent = function(args, content){
    if(args.length === 0){
        return '';
    }

    var firstArg = args[0];
    var lastArg = args[args.length - 1];

    return content.substring(firstArg && firstArg.range && firstArg.range[0], lastArg && lastArg.range && lastArg.range[1]);
};

var getGrandparent = function(node){
    return node._parent && node._parent._parent;
};

var getGreatGrandparent = function(node){
    var grandparent = getGrandparent(node);

    return grandparent && grandparent._parent;
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

var _replaceVariableAccess = function(block, variableName, transformations){
    recursiveWalk(block, null, {
        Identifier: function(node){
            if(node.name === variableName){
                if(node._parent.type !== 'VariableDeclarator'){
                    transformations.push({ position: node.range[1], insert: ' && ' + variableName + '.__lookupGetter__("result") ? ' + variableName + '.result : ' + variableName });
                }
            }
        }
    });
};

var _handleSync = function(node, content, asyncblockVarName, transformations){
    var grandparent = getGrandparent(node);
    var parent = node._parent;
    var block = getContainingAyncblock(node, asyncblockVarName);

    if(grandparent && grandparent.type === 'CallExpression' && block){
        var prevCallEnd = node._parent.object.range[1];
        var chainedFuncArgs = parent.object.arguments;
        var syncArgs = grandparent.arguments;

        var syncArgsStr = getArgsContent(syncArgs, content);
        var flowVarName = getFlowVarName(block);

        var prefix = chainedFuncArgs.length > 0 ? ', ' : '';
        var flowInsertion = prefix + flowVarName + '.addAndReuseFiber(' + syncArgsStr + ')';

        //Add flow.sync( before
        transformations.push({ position: grandparent.range[0], insert:  flowVarName + '.sync( '});

        //Add in flow.addAndReuseFiber()
        transformations.push({ position: prevCallEnd - 1, insert: flowInsertion });

        //Take off the .sync()
        transformations.push({ position: parent.range[1] - '.sync'.length, remove: grandparent.range[1] - parent.range[1] + '.sync'.length });

        //Add flow.sync closing paren
        transformations.push({ position: grandparent.range[1], insert: ' )' });
    }
};

var _handleDeferFuture = function(node, content, asyncblockVarName, transformations){
    var grandparent = getGrandparent(node);
    var parent = node._parent;
    var block = getContainingAyncblock(node, asyncblockVarName);

    if(grandparent && grandparent.type === 'CallExpression' && block){
        var prevCallEnd = node._parent.object.range[1];
        var chainedFuncArgs = parent.object.arguments;
        var syncArgs = grandparent.arguments;

        var syncArgsStr = getArgsContent(syncArgs, content);
        var flowVarName = getFlowVarName(block);

        var prefix = chainedFuncArgs.length > 0 ? ', ' : '';
        var flowInsertion = prefix + flowVarName + '.callback(' + syncArgsStr + ')';

        //Add flow.sync( before
        transformations.push({ position: grandparent.range[0], insert: flowVarName + '.future( '});

        //Add in flow.callback()
        transformations.push({ position: prevCallEnd - 1, insert: flowInsertion });

        //Take off the .defer()
        transformations.push({ position: parent.range[1] - node.name.length - 1, remove: grandparent.range[1] - parent.range[1] + node.name.length + 1 });

        //Add flow.defer closing paren
        transformations.push({ position: grandparent.range[1], insert: ' )' });
    }
};

exports.compileContents = function(content){
    var errors = [];
    var ast = esprima.parse(content, { range: true, tolerant: true });

    if(ast.errors && ast.errors.length > 0){
        var hasNonReturnError = ast.errors.some(function(error){
            return error.description !== 'Illegal return statement';
        });

        //If there's a parsing error, don't attempt to process the file
        //Note that we allow for top level return statements as this is often used in conjunction with asyncblock.enableTransform
        if(hasNonReturnError){
            return false;
        }
    }

    var _asyncblockVarName;
    var transformations = [];

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

                //Make sure the flow variable is defined
                var func = node.arguments[0];
                if(func && func.params.length === 0){
                    var functionDef = content.substring(func.range[0], func.range[1]);
                    var parenPos = functionDef.indexOf('(');

                    transformations.push({ position: func.range[0] + parenPos + 1, insert: '__asyncblock_flow' });
                }
            }
        },

        Identifier: function(node){
            if(node.name === 'sync'){
                _handleSync(node, content, _asyncblockVarName, transformations);
            } else if (node.name === 'defer'){
                var greatGrandparent = getGreatGrandparent(node);

                if(greatGrandparent){
                    var variableName;

                    if(greatGrandparent.type === 'VariableDeclarator'){
                        variableName = greatGrandparent.id.name;
                    } else if(greatGrandparent.type === 'AssignmentExpression' && greatGrandparent.left.type === 'Identifier'){
                        variableName = greatGrandparent.left.name;
                    } else {
                        //defer doesn't work here, use sync instead to retain behavior
                        _handleSync(node, content, _asyncblockVarName, transformations);
                        return;
                    }

                    _handleDeferFuture(node, content, _asyncblockVarName, transformations);
                    _replaceVariableAccess(getContainingAyncblock(node, _asyncblockVarName), variableName, transformations);
                }
            } else if(node.name === 'future'){
                _handleDeferFuture(node, content, _asyncblockVarName, transformations);
            }
        }
    });

    //Sort in descending order so we can make updates to the content without throwing off indexes
    transformations.sort(function(left, right){
        if(left.position < right.position){
            return -1;
        } else if(left.position > right.position){
            return 1;
        } else {
            return 0;
        }
    });

    for(var i = transformations.length - 1; i >= 0; i--){
        var transformation = transformations[i];

        if(transformation.insert){
            content = content.substring(0, transformation.position) + transformation.insert + content.substring(transformation.position);
        } else if(transformation.remove){
            content = content.substring(0, transformation.position) + content.substring(transformation.position + transformation.remove);
        }
    }

    //console.log(content)

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