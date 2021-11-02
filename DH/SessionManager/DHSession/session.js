const fs = require('fs');
const {parentPort} = require('worker_threads');
const { Git } = require('../../Lib/git');
const { ref_parser } = require('../../Lib/ref_parser');
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })

// Constructor
exports.Session = function(reference_model) {
    // grpc 세팅
    this.session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
    this.server = new grpc.Server();

    // gitDB 설정
    this.git_DIR = __dirname+'/gitDB';
    this.git = new Git(this.git_DIR);
    this.git.init();
    // - Reference Model에 맞춰 폴더 트리 생성
    if(typeof(reference_model) != null){
        this.setReferenceModel(reference_model);
    }

    // Initiate gRPC Server - (1): 외부 Session으로부터 Subscribe
    this.server.addService(this.session_sync.SessionSync.service, {
        SessionComm: (call, callback) => {
            // git Patch 적용
            var result = this.gitPatch(call.request.filepath, call.request.git_patch);            
            // ACK 전송
            // 문제 없으면 0, 오류 사항은 차차 정의
            callback(null, {transID: call.request.transID, result: result});
            // 카프카 메시지 생성 및 전송
            this.kafkaProducer(call.request.related);
        }
    });
}

exports.Session.prototype.setReferenceModel = function(referenceModel) {
    this.RM = referenceModel;
    // 최초 실행인 경우
    if(typeof this.rp === 'undefined') {
        this.rp = new ref_parser(this.vcRoot, this.RM);
        this.rp.createReferenceDir();
    }
    // 업데이트인 경우
    else this.rp.update(this.RM);
}

// [5]: 외부 Session으로 Publish
// target: Publish 받을 세션의 gRPC 서버 주소
// message: Session Manager로부터 받은 메시지
// - git diff pacth 파일(message.git_patch), related 정보(message.related), filepath(message.filepath)가 담겨있다.
exports.Session.prototype.Publish = function(target, message) {
    // gRPC 클라이언트 생성
    var client = new this.session_sync.Comm(target, grpc.credentials.createInsecure());
    // 보낼 내용 작성
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'related': message.related, 
                  'filepath': message.filepath, 
                  'git_patch': message.git_patch};

    // gRPC 전송
    client.SessionComm(toSend, function(err, response) {
        if (err) throw err;
        if (response.transID = toSend.transID && response.result == 0) {
            console.log("Publish Communicateion Successfull");
        }
        else {
            console.log("Error on Publish Communication");
        }
    });
}

// (2): 받은 gRPC 메시지를 갖고 자체 gitDB에 패치 적용
exports.Session.prototype.gitPatch = function(filepath, git_patch) {
    // git_pacth를 임시로 파일로 저장한다.
    var temp = __dirname + new Date() + Math.random().toString(10).slice(2,3) + '.patch';
    fs.writeFile(temp, git_patch, 'utf8', function(err) {
        if (err) console.log("Error: ", err);
        else {
            // filepath에만 git_pacth를 적용한다.
            this.git.apply(temp, filepath);
            // temp 파일 삭제
            this.git.deleteFile(temp);
        }
    });
}

// (3): Producer:asset 메시지 생성 및 전송
exports.Session.prototype.kafkaProducer = function(message) {

}