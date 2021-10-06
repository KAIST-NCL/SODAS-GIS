const fs = require('fs');
const PROTO_PATH = __dirname + '/proto/sessionSync.proto';
const { Git } = require('../../Lib/versionControl');

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
const address = '0.0.0.0:50000';
const gitDIR = "./gitDB";
var count = 0;

// git init
git = new Git(gitDIR);
git.init().then(() => { console.log('complete to git initialization')});

// todo: 타 데이터 허브의 데이터맵을 전송받아서 저장(git -> etri)하는 로직 정의 필요
server.addService(session_sync.SessionSync.service, {
    FileTransfer: (call, callback) => {
        var subfileDir = gitDIR + '/';

        !fs.existsSync(subfileDir) && fs.mkdirSync(subfileDir);
        console.log("Server Side Received:" , call.request.file_name);
        fs.writeFile(subfileDir + call.request.file_name , call.request.file, 'binary', function(err){
            if (err) throw err;
            // console.log('write end - ' + count++);
            git.apply(call.request.file_name);
            console.log(new Date().getTime())
        });
        callback(null, null);
    }
});

server.bindAsync(address, grpc.ServerCredentials.createInsecure(), () => {
    console.log('gRPC server is now working on ' + address + '!!!');
    server.start();
});
