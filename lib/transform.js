var mod = require('module').prototype;
var originalCompile = mod._compile;
var uglify = require('uglify-js_scriby');
var parser = uglify.parser;
var util = require('util');

var enabled = false;

var countNewlines = function(str){
    /*var count = 0;
     var len = str.length;
     for(var i = 0; i < len; i++){
     if(str[i] === '\n'){
     count++;
     }
     }

     return count;*/

    //Strangely enough, this is 2x faster
    return str.split('\n').length + 1;
};

var makeResultCall = function(node){
    //Transform x to (x && x.__lookupGetter__('result') ? x.result : x)
    //This allows code to work even if the future variable was later overwritten

    var resultCall =
        [ 'conditional',
            [ 'binary',
                '&&',
                node,
                [ 'call',
                    [ 'dot', node, '__lookupGetter__' ],
                    [ [ 'string', 'result' ] ]
                ]
            ],
            [ 'dot', node, 'result' ],
            node
        ];

    //Move the comments from the name onto the result call expression to not duplicate the comments after each time node is used
    resultCall.postComments = node.postComments;
    node.postComments = null;

    return resultCall;
};

var replaceVariableAccess = function(node, varId, flowVarId){
    var varName;

    if(node.containingScope){
        varName = node.containingScope.variablesRev[varId];
    }

    if(node instanceof Array){
        for(var i = 0; i < node.length; i++){
            if(node[i] == null) {
                continue;
            }

            if(node[i][0] === 'name' && varName != null && varName === node[i][1]){

                if(node[0] === 'assign' && node[1] === true && varName === node[2][1] && node[2][0] === 'name'){
                    //Don't replace assignments to the variable
                } else {
                    //Replace variable access with variable.result

                    node.splice(i, 1, makeResultCall(node[i]));
                }
            }

            replaceVariableAccess(node[i], varId, flowVarId);
        }
    }
};

var AstState = function(node, parent){
    this._after = null;
    this.node = node;
    this.parent = parent;
};

AstState.prototype.__defineSetter__('after', function(value){
    if(this._after == null){
        this._after = value;
    } else if(typeof this._after === 'function') {
        this._after = [ this._after ];
        this._after.push(value);
    }
});

var recursiveWalk = function(ast, parent, handler){
    if(typeof ast === 'object' && ast != null){
        var state = new AstState(ast, parent);

        handler(state, ast);

        for(var i = 0; i < ast.length; i++){
            recursiveWalk(ast[i], state, handler);
        }

        if(state._after != null) {
            if(typeof state._after === 'function'){
                state._after();
            } else {
                for(i = 0; i < state._after.length; i++){
                    state._after[i]();
                }
            }
        }
    }
};

var walkAST = function(ast, handler){
    recursiveWalk(ast, null, handler);
};

var endingBackslashIndicator = 'agd897fta886d9vx0d0f5dasf86sf';
var newlineIndicator = 'newline_ghas9df0s9gfkladfy';

var newlineIndicatorRegex = new RegExp('//' + newlineIndicator, 'g');
var endingBackslashIndicatorRegex = new RegExp(endingBackslashIndicator, 'g');

exports.compileContents = function(content){
    //If the content doesn't contain "asyncblock" or any calls to defer, sync, or future, don't process it
    if(!(/asyncblock/.test(content) && /\)\s*\.\s*defer\s*\(|\)\s*\.\s*sync\s*\(|\)\s*\.\s*future\s*\(/.test(content))){
        return false;
    }

    var originalContent = content;

    var maintainLines = true;

    if(maintainLines){
        //Keep track of newlines so we don't change line numbers in the file
        //It's important to keep newlines in tact so stack traces & the debugger work as expected
        content = content.replace(/^(.*?)(.?)$/gm, function(match, g1, g2){
            if(g2 !== '\\'){
                //We need to insert a space before the comment to not cause a parse error on lines starting with /* (the parser will think it's a regex)
                return match + ' //' + newlineIndicator;
            } else {
                //If the line is a string continuation, keep track of it as the parser will lose it and the lines will change
                return g1 + endingBackslashIndicator + '\\';
            }
        });
    }

    var ast;

    //If we encounter a parsing error, revert to the built-in compilation function which gives a better error message
    try {
        ast = parser.parse(content);
    } catch(e) {
        /*console.log('asyncblock: Parse error occurred when attempting to keep newlines in tact in file ' + filename);
        console.log(e.message);
        //console.log(e.stack);
        console.log('Line ', e.line, ', Column ', e.col);*/

        content = originalContent;
        maintainLines = false;

        try{
            ast = parser.parse(content);
        } catch(e) {
            //If we can't parse even the original content, fall back to the default require
            return false;
        }
    }

    var asyncblockVarId;
    var flows = [];

    var transformationMade = false;

    var runAfterTraversal = [];

    var _nextId = 0;
    var nextId = function(){
        return _nextId++;
    };

    var variableDeclarationScopes = {};//{id: scope node}

    var addVariableToScope = function(scopeNode, varName){
        var existingId = scopeNode.variables[varName];
        if(existingId != null){
            delete scopeNode.variablesRev[existingId];
        }

        var id = nextId();
        scopeNode.variables[varName] = id;
        scopeNode.variablesRev[id] = varName;

        variableDeclarationScopes[id] = scopeNode;
    };

    var processAST = (function(){
        var scopes = [];

        var addScope = function(scope){
            var node = scope.node;

            var container = scopes[scopes.length - 1];

            scopes.push(scope);

            node.variables = {};
            node.variablesRev = {};

            if(container){
                //Copy variables from the previous scope
                Object.keys(container.node.variables).forEach(function(key){
                    var value = container.node.variables[key];

                    node.variables[key] = value;
                    node.variablesRev[value] = key;
                });
            }
        };

        var addVariable = function(varName){
            var currScope = scopes[scopes.length - 1].node;
            addVariableToScope(currScope, varName);
        };

        var containingScope;

        var processAST = function(state){
            var node = state.node;

            if(typeof node === 'object' && node != null){
                if(node.processed){
                    return;
                }
                node.processed = true;

                if(containingScope == null){
                    containingScope = node;
                }

                if(node[0] === 'function'){
                    containingScope = node;

                    addScope(state);

                    node[2].forEach(function(varName){
                        addVariable(varName);
                    });

                    state.after = function(){
                        scopes.pop();
                        containingScope = scopes[scopes.length - 1].node;
                    };
                } else if(scopes.length === 0){
                    //Push on the outermost scope
                    addScope(state);
                } else if(node[0] === 'var'){
                    var varName = node[1][0][0];

                    addVariable(varName);
                }

                node.containingScope = containingScope;
            }
        };

        return processAST;
    })();

    var flowVarName;
    var flowVarId;

    walkAST(ast, function(state, node){
        processAST(state);

        if(node != null){
            var containingScope = node.containingScope;

            if(node[0] === 'call' && node[1][1] === 'require' && node[2][0][1].slice(-10) === 'asyncblock'){
                var varStatement = state.parent.parent.parent;
                if(varStatement.node && varStatement.node[0] === 'var'){
                    asyncblockVarId = containingScope.variables[state.parent.node[0]];
                } else if(state.parent.node[0] === 'assign'){
                    //Var already declared, just an assignment, like var x; x = require('asyncblock');
                    asyncblockVarId = containingScope.variables[state.parent.node[2][1]];
                }

                return;
            }

            if(containingScope){
                if(node[0] === 'function') {
                    var parent2x = state.parent.parent.node;

                    if(parent2x[0] === 'call' && asyncblockVarId != null && containingScope.variables[parent2x[1][1]] === asyncblockVarId){
                        flowVarName = node[2][0];

                        if(flowVarName == null){ //flow variable is missing, let's add it
                            node[2][0] = flowVarName = '__asyncblock_flow';
                            processAST(state);
                            addVariableToScope(node, flowVarName);
                        }

                        flowVarId = node.containingScope.variables[flowVarName];

                        flows.push({ flowVarName: flowVarName, flowVarId: flowVarId });

                        state.after = function(){
                            flows.pop();

                            var prevFlow = flows[flows.length - 1];
                            if(prevFlow != null){
                                flowVarName = prevFlow.flowVarName;
                                flowVarId = prevFlow.flowVarId;
                            } else {
                                flowVarName = null;
                                flowVarId = null;
                            }
                        };
                    }
                } else if(node[0] === 'call' && node[1][0] === 'dot' && node[1][1][0] === 'call'){ //The node is a call, and it was made on something that's also a call
                    //Make sure we're in an asyncblock
                    if(flows.length > 0){ //We're in an async block
                        //If sync was called
                        if(node[1][2] === 'sync') {
                            //Store the args passed to sync in a variable
                            var syncArgs = node[2];

                            //Remove the .sync() part
                            node.splice.apply(node, [0, node.length].concat(node[1][1]));

                            //Add the flow.callback as the last arg
                            node[2].push(['call', ['dot', ['name', flowVarName], 'addAndReuseFiber'], syncArgs ]);

                            //Surround the node with a flow.sync
                            node.splice(0, 0, 'call', ['dot', ['name', flowVarName], 'sync']);
                            node[2] = [node.splice(2, node.length - 2)];

                            transformationMade = true;
                        } else if(node[1][2] === 'future') {
                            //Store the args passed to future in a variable
                            var futureArgs = node[2];

                            //Remove the .future() part
                            node.splice.apply(node, [0, node.length].concat(node[1][1]));

                            //Add the flow.callback as the last arg
                            node[2].push(['call', ['dot', ['name', flowVarName], 'callback'], futureArgs ]);

                            //Surround the node with a flow.sync
                            node.splice(0, 0, 'call', ['dot', ['name', flowVarName], 'future']);
                            node[2] = [node.splice(2, node.length - 2)];

                            transformationMade = true;
                        } else if(node[1][2] === 'defer'){
                            //Store the args passed to defer in a variable
                            var deferArgs = node[2];

                            //Remove the .defer() part
                            node.splice.apply(node, [0, node.length].concat(node[1][1]));

                            //Add the flow.callback as the last arg
                            node[2].push(['call', ['dot', ['name', flowVarName], 'callback'], deferArgs ]);

                            //Surround the node with a flow.future
                            node.splice(0, 0, 'call', ['dot', ['name', flowVarName], 'future']);
                            node[2] = [node.splice(2, node.length - 2)];

                            //Check for an assignment
                            var parent = state.parent.node;
                            var parent3x = state.parent.parent.parent.node;

                            var assignedToName;
                            if(parent[0] === 'assign' && parent[1] === true){
                                assignedToName = parent[2][1];
                            } else if(parent3x[0] === 'var'){
                                assignedToName = parent3x[1][0][0];
                            } else {
                                //If not assiging into a variable, convert to a sync call
                                node[1][2] = 'sync';
                            }

                            //Replace variable accesses with variable.result
                            if(assignedToName != null){
                                runAfterTraversal.push((function(flowVarId){
                                    return function(){
                                        var varId = containingScope.variables[assignedToName];

                                        //Start replacing from the scope from which the variable was created
                                        replaceVariableAccess(variableDeclarationScopes[varId], varId, flowVarId);
                                    };
                                })(flowVarId));
                            }

                            transformationMade = true;
                        }
                    }
                }
            }
        }
    });

    runAfterTraversal.forEach(function(fn){
        fn();
    });

    var lineCountMaintained;
    var transformed;

    //If nothing was changed, use the original source
    if(transformationMade){
        var parsed = uglify.uglify.gen_code(ast, { beautify : false });

        if(maintainLines){
            //Comments already get newlines appended after them, so just remove the newline indicators
            parsed = parsed.replace(newlineIndicatorRegex, '');

            //Restore strings ending in \
            parsed = parsed.replace(endingBackslashIndicatorRegex, '\\\n');
        } else {
            //console.log('asyncblock: Unable to maintain newlines during transformation. Stack traces may not be accurate in ' + filename);
        }

        content = parsed;

        var contentNewlines = countNewlines(content);
        var originalNewlines = countNewlines(originalContent) + 1;

        if(contentNewlines !== originalNewlines){
            //console.log('asyncblock: Newline count does not match after transform ', contentNewlines, ' - ', originalNewlines, ' - Stack traces may not be acurate in ' + filename);
            lineCountMaintained = false;
        } else {
            lineCountMaintained = true;
        }

        transformed = true;
    } else {
        transformed = false;
        lineCountMaintained = true;
        content = originalContent;
    }

    //console.log(content.split('\n').map(function(line, i){ return (i + 1) + ': ' + line; }).join('\n'));

    return {
        content: content,
        transformed: transformed,
        lineCountMaintained: lineCountMaintained
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
            this.__asyncblock_lineCountMaintained = compileInfo.lineCountMaintained;

            if(!compileInfo.lineCountMaintained){
                console.log('asyncblock: Newline count does not match after transform - Stack traces may not be acurate in ' + filename);
            }

            /*this.__defineGetter__('__asyncblock_content', function(){
             return content.split('\n').map(function(line, i){ return (i + 1) + ': ' + line; }).join('\n');
             });*/

            return originalCompile.apply(this, arguments);
        }
    };

    return true;
};