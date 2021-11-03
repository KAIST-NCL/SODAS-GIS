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
// 최대 저장 카운트 수
var max_count = 3;

// Constructor
// Reference Model: 해당하는 reference model.rdf 파일의 경로
// rootDir: 해당 스레드의 root 폴더 이름
exports.Session = function(reference_model,rootDir) {
    // 루트 폴더 생성
    this.rootDir = __dirname+'/'+rootDir
    !fs.existsSync(rootDir) && fs.mkdirSync(rootDir);

    // 쓰레드 간 메시지 관련
    this.count_msg = 0;
    this.msg_storepath = this.rootDir+'/msgStore.json'
    
    // grpc 세팅
    this.session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
    this.server = new grpc.Server();

    // gitDB 설정
    this.git_DIR = this.rootDir+'/gitDB';
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

// [4]: SM으로부터 메시지 받아 처리하는 코드
// 해야할 일: PublishVC로부터 git diff 추출해내기
// 해야할 일: SM으로부터 현재 받고 있는 메시지의 카운트를 세서 일정 카운트마다 [5] 실시
// 해야할 일: SM으로부터 받고 있는 commit 번호 파일로 저장하기
exports.Session.prototype.prePublish = function() {
    // parentPort, 즉 자신을 생성한 SM으로부터 메시지를 받아 처리하는 함수.
    parentPort.on('message', message => {
        // 우선 메시지 수신 시 카운트를 센다.
        this.count_msg += 1;


    });
    // count가 max_count에 도달한 경우 Publish를 한다.
    if (this.count_msg >= max_count) {
        // 우선, 파일 내용을 읽어온다.
        var storedData = fs.readFileSync(this.msg_storepath).toString();
        // 파일 파싱

        // git diff 추출

        // gRPC 전송

    }
}

// [5]: 외부 Session으로 Publish
// gRPC 전송 전용 코드
// target: Publish 받을 세션의 gRPC 서버 주소
exports.Session.prototype.Publish = function(target, related, filepath, git_patch) {
    // gRPC 클라이언트 생성
    var client = new this.session_sync.Comm(target, grpc.credentials.createInsecure());
    // 보낼 내용 작성
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'related': related, 
                  'filepath': filepath, 
                  'git_patch': git_patch};

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