
const fs = require('fs')

const CHUNK_SIZE = 4*1024*1024 - 10
const PROTO_PATH = __dirname + '/proto/sessionSync.proto';

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
const session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
const server = new grpc.Server();
const port = 50000;

// todo: 타 데이터 허브의 데이터맵을 전송받아서 저장(git -> etri)하는 로직 정의 필요
server.addService(session_sync.SessionSync.service, {
    SessionInit: (call, callback) => {
        var subfileDir = './SubMaps'
        console.log("Server Side Received:" , call.request.transID)
        fs.writeFile(subfileDir + call.request.filedir , call.request.publishDatamap, 'binary', function(err){
            if (err) throw err
            console.log('write end') });
        callback(null, {transID: call.request.transID + 'OK', result: "Success"});
    }
})

server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
    console.log('gRPC server is now working on ' + port + '!!!')
    server.start();
});
