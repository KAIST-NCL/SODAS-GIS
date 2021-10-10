var encoder = require('./encoder');

if (process.argv.length != 3) {
    console.log("This program needs 1 argument for file name to read/write");
    process.exit();
};

var filename = "./" + process.argv[2];
var encoded = encoder.rdf_to_binary(filename);
console.log(encoded);
var newjson = encoder.mkeventjson(encoded);
console.log(newjson);
encoder.str_to_file(newjson, filename);