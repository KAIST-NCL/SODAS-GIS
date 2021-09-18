var http = require('http');
var fs = require('fs');

const file = fs.createWriteStream("temp.rdf");

var url = 'http://127.0.0.1:9009/download';

const requiest = http.get(url, function(response) {
    response.pipe(file);
});

