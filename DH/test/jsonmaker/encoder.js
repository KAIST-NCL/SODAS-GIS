const fs = require('fs');

const baseevent = './base.json'

exports.utf8ToBin = function( s ){
    s = unescape( encodeURIComponent( s ) );
    var chr, i = 0, l = s.length, out = '';
    for( ; i < l; i ++ ){
        chr = s.charCodeAt( i ).toString( 2 );
        while( chr.length % 8 != 0 ){ chr = '0' + chr; }
        out += chr;
    }
    return out;
};

// read file to string
exports.file_to_string = function(filename) {
    let readFile = fs.readFileSync(filename);
    const file_str = readFile.toString('utf8')
    return file_str;
}

exports.mkeventjson = function (content) {
    var temp = fs.readFileSync(baseevent);
    temp = temp.toString();
    temp = temp.replace('replace', content);
    return temp;
}

exports.str_to_file = function (str, filename, prefix) {
    var savename = filename.replace('rdf', 'json');
    var savename = prefix + savename;
    console.log(savename);
    fs.writeFile(savename, str, function(error) {
        if (error) console.log("Error: ", error);
    });
}

exports.binToUtf8 = function( s ){
    var i = 0, l = s.length, chr, out = '';
    for( ; i < l; i += 8 ){
        chr = parseInt( s.substr( i, 8 ), 2 ).toString( 16 );
        out += '%' + ( ( chr.length % 2 == 0 ) ? chr : '0' + chr );
    }
    return decodeURIComponent( out );
};

