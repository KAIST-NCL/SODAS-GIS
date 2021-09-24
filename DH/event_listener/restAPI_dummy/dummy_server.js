var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var request = require('request');

app.use(express.static(__dirname + '/rdf'));
app.use(bodyParser.json());

app.get('/', function(req, res) {
    res.sendFile('index.html');
});

app.get('/download', function(req, res) {
    const file = 'rdf/example.rdf';
    res.download(file);
})

app.listen(9009, function() {
    console.log("start!");
});