const fs = require('fs');

const baseevent = './base.json'

var utf8ToBin = function( s ){
    s = unescape( encodeURIComponent( s ) );
    var chr, i = 0, l = s.length, out = '';
    for( ; i < l; i ++ ){
        chr = s.charCodeAt( i ).toString( 2 );
        while( chr.length % 8 != 0 ){ chr = '0' + chr; }
        out += chr;
    }
    return out;
};

// rdf 파일을 읽고 binary로 인코딩하여 저장
exports.rdf_to_binary = function(rdf_file) {
    let readFile = fs.readFileSync(rdf_file); // readFile 자체가 Buffer를 반환
    const file_str = readFile.toString('utf8');
    const buff = utf8ToBin(file_str);
    return buff;
}

exports.mkeventjson = function (content) {
    var temp = fs.readFileSync(baseevent);
    temp = temp.toString();
    temp = temp.replace('replace', content);
    return temp;
}

exports.str_to_file = function (str, filename) {
    var savename = filename.replace('rdf', 'json')
    console.log(savename);
    fs.writeFile(savename, str, function(error) {
        if (error) console.log("Error: ", err);
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

