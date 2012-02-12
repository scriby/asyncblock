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

var replaceVariableAccess = function(node, varId, flowVarId){
    if(node instanceof Array){
        for(var i = 0; i < node.length; i++){
            if(node[i] != null){
                if(node[i][0] === 'name'){
                    if(node.containingScope){
                        var varName = node.containingScope.variablesRev[varId];

                        if(varName != null && varName === node[i][1]){
                            if(node[0] === 'assign' && node[1] === true){
                                //Don't replace calls to flow.something

                                var assigned = node[3];
                                if(assigned[0] === 'call' && assigned[1][0] === 'dot' && node.containingScope.variables[assigned[1][1][1]] === flowVarId){

                                } else {
                                    //Replace variable with variable.result
                                    node[2] = [ 'dot', node[2], 'result' ];
                                }
                            } else {
                                //Replace variable with variable.result
                                node.splice(i, 1, [ 'dot', node[i], 'result' ]);
                            }
                        }
                    }
                }

                replaceVariableAccess(node[i], varId, flowVarId);
            }
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

exports.enableTransform = function(){
    if(enabled){
        return false;
    } else {
        enabled = true;
    }

    var endingBackslashIndicator = 'agd897fta886d9vx0d0f5dasf86sf';
    var newlineIndicator = 'newline_ghas9df0s9gfkladfy';

    var newlineIndicatorRegex = new RegExp('//' + newlineIndicator, 'g');
    var endingBackslashIndicatorRegex = new RegExp(endingBackslashIndicator, 'g');

    mod._compile = function(content, filename) {
        //If the content doesn't contain "asyncblock" or any calls to defer, sync, or future, don't process it
        if(!(/asyncblock/.test(content) && /\)\s*\.\s*defer\s*\(|\)\s*\.\s*sync\s*\(|\)\s*\.\s*future\s*\(/.test(content))){
            return originalCompile.apply(this, arguments);
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
            console.log('asyncblock: Parse error occurred when attempting to keep newlines in tact in file ' + filename);
            console.log(e.message);
            //console.log(e.stack);
            console.log('Line ', e.line, ', Column ', e.col);

            content = originalContent;
            maintainLines = false;

            try{
                ast = parser.parse(content);
            } catch(e) {
                //If we can't parse even the original content, fall back to the default require
                return originalCompile.apply(this, arguments);
            }
        }

        var asyncblockVarId;
        var flowVarId;
        var flowVarName;

        var transformationMade = false;

        var runAfterTraversal = [];

        var _nextId = 0;
        var nextId = function(){
            return _nextId++;
        };

        var variableDeclarationScopes = {};//{id: scope node}

        var processAST = (function(){
            var scopes = [];

            var addScope = function(scope){
                var node = scope.node;

                var container = scopes[scopes.length - 1];

                scopes.push(scope);

                Object.defineProperty(node, 'variables', { value: {}, enumerable: false });
                Object.defineProperty(node, 'variablesRev', { value: {}, enumerable: false });

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

                var existingId = currScope.variables[varName];
                if(existingId != null){
                    delete currScope.variablesRev[existingId];
                }

                var id = nextId();
                currScope.variables[varName] = id;
                currScope.variablesRev[id] = varName;

                variableDeclarationScopes[id] = currScope;
            };

            var containingScope;

            var processAST = function(state){
                var node = state.node;

                if(typeof node === 'object' && node != null){
                    if(node.processed){
                        return;
                    }
                    Object.defineProperty(node, 'processed', { value: true, enumerable: false });

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

                    Object.defineProperty(node, 'containingScope', { value: containingScope, enumerable: false });
                }
            };

            return processAST;
        })();

        var isInAsyncBlock = 0;

        walkAST(ast, function(state, node){
            processAST(state);

            if(node != null){
                var containingScope = node.containingScope;

                if(node[0] === 'call' && node[1][1] === 'require' && node[2][0][1].slice(-10) === 'asyncblock'){
                    var varStatement = state.parent.parent.parent;
                    if(varStatement.node && varStatement.node[0] === 'var'){
                        asyncblockVarId = containingScope.variables[state.parent.node[0]];
                    }

                    return;
                }

                if(containingScope){
                    if(node[0] === 'function') {
                        var parent2x = state.parent.parent.node;

                        if(parent2x[0] === 'call' && asyncblockVarId != null && containingScope.variables[parent2x[1][1]] === asyncblockVarId){
                            flowVarName = node[2];
                            flowVarId = node.containingScope.variables[flowVarName];

                            isInAsyncBlock++;

                            state.after = function(){
                                isInAsyncBlock--;
                            };
                        }
                    } else if(node[0] === 'call' && node[1][0] === 'dot' && containingScope.variables[node[1][1][1]] !== flowVarId){ //Detect calls on the flow variable
                        //Make sure we're in an asyncblock
                        if(isInAsyncBlock > 0){
                            //If sync was called
                            if(node[1][2] === 'sync') {
                                //Remove the .sync() part
                                node.splice.apply(node, [0, node.length].concat(node[1][1]));

                                //Add the flow.callback as the last arg
                                node[2].push(['call', ['dot', ['name', flowVarName], 'callback'] ]);

                                //Surround the node with a flow.sync
                                node.splice(0, 0, 'call', ['dot', ['name', flowVarName], 'sync']);
                                node[2] = [node.splice(2, node.length - 2)];

                                transformationMade = true;
                            } else if(node[1][2] === 'future') {
                                //Remove the .future() part
                                node.splice.apply(node, [0, node.length].concat(node[1][1]));

                                //Add the flow.callback as the last arg
                                node[2].push(['call', ['dot', ['name', flowVarName], 'callback'] ]);

                                //Surround the node with a flow.sync
                                node.splice(0, 0, 'call', ['dot', ['name', flowVarName], 'future']);
                                node[2] = [node.splice(2, node.length - 2)];

                                transformationMade = true;
                            } else if(node[1][2] === 'defer'){
                                //Remove the .defer() part
                                node.splice.apply(node, [0, node.length].concat(node[1][1]));

                                //Add the flow.callback as the last arg
                                node[2].push(['call', ['dot', ['name', flowVarName], 'callback'] ]);

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
                                } else if(parent[0] === 'return'){
                                    //If returning immediately, we should use sync instead of future
                                    node[1][2] = 'sync';
                                }

                                //Replace variable accesses with variable.result
                                if(assignedToName != null){
                                    runAfterTraversal.push((function(flowVarId){
                                        return function(){
                                            var varId = containingScope.variables[assignedToName];

                                            //Start replacing from the scope from which the variable was created
                                            replaceVariableAccess(variableDeclarationScopes[varId], varId, flowVarId);
                                        }
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

        //If nothing was changed, use the original source
        if(transformationMade){
            var parsed = uglify.uglify.gen_code(ast, { beautify : false });

            if(maintainLines){
                //Comments already get newlines appended after them, so just remove the newline indicators
                parsed = parsed.replace(newlineIndicatorRegex, '');

                //Restore strings ending in \
                parsed = parsed.replace(endingBackslashIndicatorRegex, '\\\n');
            } else {
                console.log('asyncblock: Unable to maintain newlines during transformation. Stack traces may not be accurate in ' + filename);
            }

            content = parsed;

            var contentNewlines = countNewlines(content);
            var originalNewlines = countNewlines(originalContent) + 1;

            if(contentNewlines !== originalNewlines){
                console.log('asyncblock: Newline count does not match after transform ', contentNewlines, ' - ', originalNewlines, ' - Stack traces may not be acurate in ' + filename);
                this.__asyncblock_lineCountMaintained = false;
            } else {
                this.__asyncblock_lineCountMaintained = true;
            }

            this.__asyncblock_transformed = true;
            /*this.__defineGetter__('__asyncblock_content', function(){
                return content.split('\n').map(function(line, i){ return (i + 1) + ': ' + line; }).join('\n');
            });*/
        } else {
            content = originalContent;
        }

        return originalCompile.apply(this, arguments);
    };

    return true;
};