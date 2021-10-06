const fs = require('fs');
var path = require('path');
const PROTO_PATH = __dirname + '/proto/sessionSync.proto';

const grpc = require('@grpc/grpc-js');
const protoload = require('@grpc/grpc-loader');
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });

const session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;


// 파일전송
exports.fileTrasnfer = function( target , filepath) {
    // gRPC 연결
    var client = new session_sync.SessionSync(target, grpc.credentials.createInsecure());

    // 베이스이름 추출
    var filename = path.basename(filepath);

    // 파일 읽어낸 후 바이트전송
    fs.readFile( filepath , (err, data) => {
        if (err) throw err
        client.SessionInit({file_name: filename,
                                 file: data},
            function (err, response) {
            console.log('Communication Finished');
        })
    })
}