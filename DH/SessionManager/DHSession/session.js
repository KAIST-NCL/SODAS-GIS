const fs = require('fs');
const path = require('path');
const kafka = require('kafka-node');
const {parentPort, workerData} = require('worker_threads');
const { subscribeVC } = require('../../VersionControl/versionController')
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const execSync = require('child_process').execSync;
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })

const session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
const session = require(__dirname + '/session');


// Constructor
// workerData -> my_session_id, my_ip, my_portNum
exports.Session = function() {
    console.log("*** Session Created");
    console.log("WorkerData: " + workerData);
    console.log("***************");
    this.count_msg = 0;
    this.kafkaClient = new kafka.KafkaClient();
    this.kafkaproducer = new kafka.Producer(this.kafkaClient);
    this.pubvc_root = workerData.pubvc_root;
    // 루트 폴더 생성
    this.id = workerData.my_session_id;
    this.rootDir = workerData.subvc_root+'/'+this.id;
    !fs.existsSync(this.rootDir) && fs.mkdirSync(this.rootDir);

    // 쓰레드 간 메시지 관련
    this.msg_storepath = this.rootDir+'/msgStore.json'

    // gitDB 설정
    this.VC = new subscribeVC(this.rootDir+'/gitDB');
    this.VC.init();

    // FirstCommit 반영
    this._reset_count(this.VC.returnFirstCommit());

    // gRPC 서버 시작
    this.ip = workerData.my_ip;
    this.my_port = workerData.my_portNum;
    this.server = new grpc.Server();
    var self = this;
    this.server.addService(session_sync.SessionSync.service, {
        // (1): 외부 Session으로부터 Subscribe - 상대방이 자신의 id를 건네줄 것인데, 이를 자신이 갖고 있는 상대방의 id와 비교해서 맞을 때만 처리
        SessionComm: (call, callback) => {
            console.log('Server: ' + self.id + ' gRPC Received: to ' + call.request.receiver_id);
            // 상대가 보낸 session_id가 나의 일치할 때만 처리
            if (call.request.receiver_id == self.id) {
                console.log("Git Patch Start");
                // git Patch 적용
                var result = self.gitPatch(call.request.git_patch, self);            
                // ACK 전송
                // 문제 없으면 0, 오류 사항은 차차 정의
                callback(null, {transID: call.request.transID, result: result});
                // 카프카 메시지 생성 및 전송
                self.kafkaProducer(call.request.content, self);
            }    
        }
    });
    
    // parentPort, 즉 자신을 생성한 SM으로부터 메시지를 받아 처리하는 함수.
    parentPort.on('message', message => {
        console.log("**** Session ID: " + this.id + " Received Thread Msg ###");
        console.log(message);
        console.log("********************************************")
        switch(message.event) {
            // Session 실행 시 SM으로부터 받아오는 값
            case 'INIT':
                this._init();
                break;
            // 연결될 상대방 Session 정보
            case 'TRANSMIT_NEGOTIATION_RESULT':
                // 처음 연동일 때에 sync_interest_list를 참조해서 상대방에 gitDB Publish를 한다.
                this.target = message.end_point.ip + ':' + message.end_point.port;
                console.log('Target:' + this.target);
                // gRPC 클라이언트 생성
                this.grpc_client = new session_sync.SessionSync(this.target, grpc.credentials.createInsecure());
                this.session_desc = message.session_desc;
                this.sn_options = message.sn_options; // sync_interest_list, data_catalog_vocab, sync_time, sync_count, transfer_interface
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
exports.Session.prototype._init = function() {
    const addr = this.ip+':'+this.my_port;
    this.server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), ()=> {
        this.server.start();
    });
}

// [4]: SM으로부터 메시지 받아 처리하는 코드
// 해야할 일: 절대 경로로부터 git diff 추출해내기
// 해야할 일: SM으로부터 현재 받고 있는 메시지의 카운트를 세서 일정 카운트마다 [5] 실시
// 해야할 일: SM으로부터 받고 있는 commit 번호 파일로 저장하기
exports.Session.prototype.prePublish = function(message) {
    // message로 전달받은 내용을 갖고 파일 작성 및 저장
    var content = this.__read_dict();
    content.stored = content.stored + 1;
    content.asset_id.push(message.asset_id);
    content.commit_number.push(message.commit_number);
    content.related.push(message.related);
    content.filepath.push(message.filepath);
    this.__save_dict(content);
    // 아래 조건 충족 시 Publsih를 실행한다.
    if (this.__check_MaxCount()) this.onMaxCount();
}

exports.Session.prototype.onMaxCount = async function() {
    this.count_msg = 0;
    console.log("onMaxCount");
    // 우선, 파일 내용을 읽어온 뒤 초기화를 진행한다.
    const topublish = this.__read_dict();
    this._reset_count(topublish.commit_number[topublish.commit_number.length - 1]);
    // git diff 추출
    this.extractGitDiff(topublish).then((git_diff) => {
        // gRPC 전송 - kafka에 쓸 전체 related, git patch를 적용할 가장 큰 폴더 단위, git patch 파일 내용 
        this.Publish(topublish.related, topublish.filepath, git_diff);
    });    
}

exports.Session.prototype.extractGitDiff = async function(topublish) {
    // mutex 적용
    if (this.VC.returnFlagStatus()) {
        // retry diff
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        // mutex on
        this.VC.setFlagStatus(true);
        var git_diff = '';
        for (var i=0; i < topublish.stored; i++) {
            // comID 넣는 순서는 어떻게 할 것인가? - 정의 필요. 아래는 현재 예시 코드
            var comID1 = (i > 0) ? topublish.commit_number[i-1] : topublish.previous_last_commit;
            var comID2 = topublish.commit_number[i];
            var diff_dir = this.pubvc_root + '/' + topublish.filepath[i];
            // 테스트 결과 무조건 git init된 폴더 내에서 diff를 추출해야한다. 즉, diff를 추출하고자 하는 곳, publishVC의 root 디렉토리를 알아야한다.
            git_diff = git_diff + execSync('cd ' + path.dirname(diff_dir) + ' && git diff '+comID1+' '+' '+comID2+' -- '+ diff_dir).toString();
        }
        this.VC.setFlagStatus(false);
        // mutex off
        console.log(git_diff);
        return git_diff;
    }
}

exports.Session.prototype._reset_count = function(last_commit) {
    this.count_msg = 0;
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    // 파일 초기화
    const content = {
        stored: 0,
        asset_id: [],
        commit_number: [],
        related: [],
        filepath: [],
        previous_last_commit: lc
    }
    this.__save_dict(content);
}

// [5]: 외부 Session으로 Publish
// gRPC 전송 전용 코드
// target: Publish 받을 세션의 gRPC 서버 주소
exports.Session.prototype.Publish = function(related, filepath, git_patch) {
    console.log("Publish");
    // content 만들기. related와 filepath를 json으로 만들어 넣는다.
    var temp = {
        related: related,
        filepath: filepath
    };

    var content = JSON.stringify(temp);

    // 보낼 내용 작성
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'content': content, 
                  'git_patch': git_patch,
                  'receiver_id': this.session_desc.session_id
                };

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
exports.Session.prototype.gitPatch = function(git_patch, self) {
    // git_pacth를 임시로 파일로 저장한다.
    var temp = self.rootDir + "/" + Math.random().toString(10).slice(2,3) + '.patch';
    fs.writeFile(temp, git_patch, 'utf8', function(err) {
        if (err) console.log("Error: ", err);
        else {
            self.VC.apply(temp);
            // temp 파일 삭제
            fs.existsSync(temp) && fs.unlink(temp, function (err) {
                if (err) {
                console.log("Error: ", err);
                }
            });
        }
    });
}

// (3): Producer:asset 메시지 생성 및 전송
exports.Session.prototype.kafkaProducer = function(json_string, self) {
    console.log(json_string);
    // message.content에 related, filepath 정보가 담겨있기에 json 파싱을 해야한다.
    var related_array = JSON.parse(json_string).related;
    var filepath_array = JSON.parse(json_string).filepath;
    // 보낼 메시지 내용 - operation, id, related, content.interest, content.reference_model
    var payloads = [];
    for (var i = 0; i < related_array.length; i++) {
        payloads.push({
            "operation": "UPDATE",
            "id": path.basename(filepath_array[i], '.asset'),
            "related": related_array[i],
            "content": fs.readFileSync(filepath_array[i]).toString()
        });
    }
    console.log(" =========  Kafka Message  ==========")
    console.log(payloads)
    console.log(" ====================================")

    // self.kafkaproducer.on('ready', function() {
    //     self.kafkaproducer.send(payloads, function(err, result) {
    //         console.log(result);
    //     });
    // });
}

// Publish 조건 충족 여부 확인 함수
exports.Session.prototype.__check_MaxCount = function() {
    // 만약 count가 sync_count 이상이 된 경우
    // sync_count가 [a,b] 형식인데 이거 의미는?
    if (this.count_msg >= this.sn_options.sync_desc.sync_count[0]) return true;
    // 만약 sync_time을 초과한 경우

    // 그 외에는 전부 false
    return false;
}

exports.Session.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msg_storepath, contentJSON);
}

exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msg_storepath.toString()));
}

const ss = new session.Session();