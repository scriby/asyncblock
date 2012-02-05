var mod = require('module').prototype;
var originalCompile = mod._compile;
var traverse = require('traverse');
var uglify = require('uglify-js');
var parser = uglify.parser;
var util = require('util');

var isInAsyncBlock = function(curr, asyncblockVarName){
    if(curr == null){
        return false;
    }

    var node = curr.node;

    if(node[0] === 'call' && node[1][1] === asyncblockVarName){
        return true;
    } else {
        return isInAsyncBlock(curr.parent, asyncblockVarName);
    }
};

var endingBackslashIndicator = 'g65hs4fg0j6s78fg59sd4f48hg9h96sg7d4g469vbnb0k8uyt';

mod._compile = function(content, filename) {
    //If the content doesn't contain "asyncblock", don't process it
    if(!(/asyncblock/.test(content))){
        return originalCompile.call(this, arguments);
    }

    //Keep track of newlines so we don't change line numbers in the file
    //It's important to keep newlines in tact so stack traces & the debugger work as expected
    content = content.replace(/(.)?\n/g, function(match, g1){
        if(g1 !== '\\'){
            return match + '\nnewline();';
        } else {
            //If the line is a string continuation, keep track of it as the parser will lose it and the lines will change
            return match + endingBackslashIndicator;
        }
    });

    var ast = parser.parse(content);

    var asyncblockVarName = 'asyncblock';
    var flowVarName = 'flow';

    var topLevel = traverse(ast).forEach(function(){
        var node = this.node;

        if(node != null){
            if(node[0] === 'call'){
                //console.log(util.inspect(node, false, 10));
            }

            if(node[0] === 'call' && node[1][1] === 'require' && node[2][0][1].slice(-10) === 'asyncblock'){
                var varStatement = this.parent.parent.parent;
                if(varStatement.node && varStatement.node[0] === 'var'){
                    asyncblockVarName = this.parent.node[0];
                }
            }

            if(node[0] === 'call' && node[1][1] === asyncblockVarName){
                flowVarName = node[2][0][2][0];
            }

            if(node[0] === 'call' && node[1][0] === 'dot' && node[1][1][1] !== flowVarName && node[1][2] === 'sync'){
                if(isInAsyncBlock(this, asyncblockVarName)){
                    //Remove the .sync part
                    node[1] = node[1][1];

                    //Add the flow.callback as the last arg
                    node[2].push(['call', ['dot', ['name', flowVarName], 'callback'] ]);

                    //Surround the node with a flow.sync
                    node.splice(0, 0, 'call', ['dot', ['name', flowVarName], 'sync']);
                    node[2] = [node.splice(2, node.length - 2)];
                }
            }
        }
    });

    var parsed = uglify.uglify.gen_code(topLevel, { beautify : false });

    //Restore newlines
    parsed = parsed.replace(/newline\(\);?\n?/g, '\n');

    //Restore strings ending in \
    parsed = parsed.replace(new RegExp(endingBackslashIndicator, 'g'), '\\\n');

    content = parsed;

    return originalCompile.apply(this, arguments);
};