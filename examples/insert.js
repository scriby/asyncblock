var mongodb = require('mongodb');
var server    = new mongodb.Server('localhost', mongodb.Connection.DEFAULT_PORT, {});
var connector = new mongodb.Db('test', server, {});
var greenlight = require('../greenlight');

greenlight(function(red, green, cancel) {
	connector.open(green);
	var client = red();
	client.collection('test_collection', green);
	var collection = red();
	collection.insert({hello: 'world'}, {safe:true}, green);
	red('!');
	client.close(green);
	red('!');
	console.log('all finished');
});

