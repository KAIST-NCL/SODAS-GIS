var encoder = require('./encoder');

if (process.argv.length != 4) {
    console.log("This program needs 2 argument: filename, option[content|raw]");
    process.exit();
};

var filename = process.argv[2];
var option = process.argv[3];
if (option == 'content') {
    var str = encoder.file_to_string(filename);
    var encoded = encoder.utf8ToBin(str);
    var newjson = encoder.mkeventjson(encoded);
    encoder.str_to_file(newjson, filename, option);
}
else if (option == 'raw') {
    var str = encoder.file_to_string(filename);
    var newjson = encoder.mkeventjson(str);
    encoder.str_to_file(newjson, filename, option);
}