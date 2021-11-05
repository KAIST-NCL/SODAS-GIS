const fs = require('fs');
const ip = require('ip');
const {parentPort, workerData} = require('worker_threads');
const { Git } = require('../../Lib/git');
const { ref_parser } = require('../../Lib/ref_parser');
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Session } = require('inspector');
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })

const session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;

// Constructor
// workerData -> referenceModel, id, gRPC port,
exports.Session = function() {
    this.count_msg = 0;
    // parentPort, 즉 자신을 생성한 SM으로부터 메시지를 받아 처리하는 함수.
    parentPort.on('message', message => {
        // 루트 폴더 생성
        this.id = message.session_id;
        this.rootDir = __dirname+'/'+workerData.id;
        !fs.existsSync(rootDir) && fs.mkdirSync(rootDir);

        // 쓰레드 간 메시지 관련
        this.msg_storepath = this.rootDir+'/msgStore.json'

        // gitDB 설정
        this.git_DIR = this.rootDir+'/gitDB';
        this.git = new Git(this.git_DIR);
        this.git.init();

        // - Reference Model에 맞춰 폴더 트리 생성
        if(typeof(message.reference_model) != null){
            this.setReferenceModel(workerData.reference_model);
        }

        // gRPC 서버 시작
        this.ip = workerData.dm_ip;
        this.my_port = workerData.sess_portNum;
        this.server = new grpc.Server();
        this.server.addService(session_sync.SessionSync.service, {
            SessionComm: this.Subscribe
        });
        switch(message.event) {
            // Session 실행 시 SM으로부터 받아오는 값
            case 'INIT':
                this._init();
                break;
            // 연결될 상대방 Session 정보
            case 'TRANSMIT_NEGOTIATION_RESULT':
                this.target = message.ip + ':' + message.port;
                // gRPC 클라이언트 생성
                this.grpc_client = new this.session_sync.Comm(this.target, grpc.credentials.createInsecure());
                this._reset_count();
                this.sync_interest_list = message.sync_interest_list;
                this.data_catalog_vocab = message.data_catalog_vocab;
                this.sync_time = message.sync_time;
                this.sync_count = message.sync_count;
                this.transfer_interface = message.transfer_interface;
                break;
            // Publish할 내용을 받아온다.
            case 'UPDATE_PUB_ASSET':
                // asset_id, commit_number, related, filepath
                // 우선 메시지 수신 시 카운트를 센다.
                this.count_msg += 1;
                this.prePublish(message);
                break;        
        }
    });
}

// Initiate Session
exports.Session.prototype._init = function(message) {
    const address = this.ip+':'+this.my_port;
    this.server.bindAsync(address, grpc.ServerCredentials.createInsecure(), ()=> {
        this.server.start();
    });
}

exports.Session.prototype.setReferenceModel = function(referenceModel) {
    this.RM = referenceModel;
    // 최초 실행인 경우
    if(typeof this.rp === 'undefined') {
        this.rp = new ref_parser(this.git_DIR, this.RM);
        this.rp.createReferenceDir();
    }
    // 업데이트인 경우
    else this.rp.update(this.RM);
}

// [4]: SM으로부터 메시지 받아 처리하는 코드
// 해야할 일: PublishVC로부터 git diff 추출해내기
// 해야할 일: SM으로부터 현재 받고 있는 메시지의 카운트를 세서 일정 카운트마다 [5] 실시
// 해야할 일: SM으로부터 받고 있는 commit 번호 파일로 저장하기
exports.Session.prototype.prePublish = function(message) {
    // message로 전달받은 내용을 갖고 파일 작성 및 저장
    // 처음 연동일 때에 sync_interest_list를 참조해서 상대방에 gitDB Publish를 한다.
    

    // 아래 조건 충족 시 Publsih를 실행한다.
    if (this.__check_MaxCount()) this.onMaxCount();
}

exports.Session.prototype.onMaxCount = function() {
    // 우선, 파일 내용을 읽어온 뒤 초기화를 진행한다.
    var storedData = fs.readFileSync(this.msg_storepath).toString();
    this._reset_count();
    // 파일 파싱

    // git diff 추출

    // gRPC 전송
    this.Publish();
}

exports.Session.prototype._reset_count = function() {
    this.count_msg = 0;
    // 파일 초기화

}

// [5]: 외부 Session으로 Publish
// gRPC 전송 전용 코드
// target: Publish 받을 세션의 gRPC 서버 주소
exports.Session.prototype.Publish = function(related, filepath, git_patch) {
    // 보낼 내용 작성
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'related': related, 
                  'filepath': filepath, 
                  'git_patch': git_patch};

    // gRPC 전송
    this.grpc_client.SessionComm(toSend, function(err, response) {
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

// (1): 외부 Session으로부터 Subscribe
Session.prototype.Subscribe = function(call, callback) {
    // git Patch 적용
    var result = this.gitPatch(call.request.filepath, call.request.git_patch);            
    // ACK 전송
    // 문제 없으면 0, 오류 사항은 차차 정의
    callback(null, {transID: call.request.transID, result: result});
    // 카프카 메시지 생성 및 전송
    this.kafkaProducer(call.request);
}

// (3): Producer:asset 메시지 생성 및 전송
Session.prototype.kafkaProducer = function(message) {

}

// Publish 조건 충족 여부 확인 함수
Session.prototype.__check_MaxCount = function() {
    // 만약 count가 sync_count 이상이 된 경우
    if (this.count >= this.sync_count) return true;
    // 만약 sync_time을 초과한 경우

    // 그 외에는 전부 false
    return false;
}