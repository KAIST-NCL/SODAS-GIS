const fs = require('fs');
const path = require('path');
const diff_parser = require('../../Lib/diff_parser');
var kafka = require('kafka-node');
const {parentPort, workerData} = require('worker_threads');
const {subscribeVC } = require('../../VersionControl/versionController')
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
const debug = require('debug')('sodas:session');


// Constructor
// workerData -> my_session_id, my_ip, my_portNum
exports.Session = function() {
    debug("[LOG] Session Created");
    debug(workerData);
    this.count_msg = 0;

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
    
    // Mutex_Flag 준비 되면 주석 해제
    this.flag = workerData.mutex_flag; // mutex flag

    // FirstCommit 반영 Change Log -> added self as argument to returnFirstCommit
    this._reset_count(this.VC.returnFirstCommit(this.VC, this.pubvc_root));

    // gRPC 서버 시작
    this.ip = workerData.my_ip;
    this.my_port = workerData.my_portNum;
    this.server = new grpc.Server();
    var self = this;
    this.server.addService(session_sync.SessionSync.service, {
        // (1): 외부 Session으로부터 Subscribe - 상대방이 자신의 id를 건네줄 것인데, 이를 자신이 갖고 있는 상대방의 id와 비교해서 맞을 때만 처리
        SessionComm: (call, callback) => {
            self.Subscribe(self, call, callback);
        }
    });

    // parentPort, 즉 자신을 생성한 SM으로부터 메시지를 받아 처리하는 함수.
    parentPort.on('message', message => {
        debug("[Session ID: " + this.id + "] Received Thread Msg ###");
        debug(message);
        switch(message.event) {
            // Session 실행 시 SM으로부터 받아오는 값
            case 'INIT':
                this._init();
                break;
            // 연결될 상대방 Session 정보
            case 'TRANSMIT_NEGOTIATION_RESULT':
                // 처음 연동일 때에 sync_interest_list를 참조해서 상대방에 gitDB Publish를 한다.
                this.target = message.data.end_point.ip + ':' + message.data.end_point.port;
                debug('[LOG] Target:' + this.target);
                // gRPC 클라이언트 생성
                this.grpc_client = new session_sync.SessionSync(this.target, grpc.credentials.createInsecure());
                this.session_desc = message.data.session_desc;
                this.sn_options = message.data.sn_options; // sync_interest_list, data_catalog_vocab, sync_time, sync_count, transfer_interface
                break;
            // Publish할 내용을 받아온다.
            case 'UPDATE_PUB_ASSET':
                // asset_id, commit_number, related, filepath
                // 우선 메시지 수신 시 카운트를 센다.
                this.count_msg += 1;
                this.prePublish(message.data);
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

/// [4]: hanldes the msg from Session Manager
exports.Session.prototype.prePublish = function(message) {
    // message로 전달받은 내용을 갖고 파일 작성 및 저장
    // change log: Now only the commit number is needed
    // ToDo: Rather than calling this function whenever receiving the thread call from SM, call this function just like the vcModule calls commit function
    var content = this.__read_dict();
    content.stored = content.stored + 1;
    content.commit_number.push(message.commit_number);
    this.__save_dict(content);
    // 아래 조건 충족 시 Publsih를 실행한다.
    if (this.__check_MaxCount()) this.onMaxCount();
}

/// If the count / sync time reaches some point, extract the git diff and publish it to other session
exports.Session.prototype.onMaxCount = async function() {
    this.count_msg = 0;
    debug("[LOG] onMaxCount");
    // 우선, 파일 내용을 읽어온 뒤 초기화를 진행한다.
    const topublish = this.__read_dict();
    this._reset_count(topublish.commit_number[topublish.commit_number.length - 1]);
    // git diff 추출
    this.extractGitDiff(topublish).then((git_diff) => {
        // gRPC 전송 - kafka에 쓸 전체 related, git patch를 적용할 가장 큰 폴더 단위, git patch 파일 내용
        this.Publish(git_diff);
    });
}

/// To extract git diff using two git commit numbers
exports.Session.prototype.extractGitDiff = async function(topublish) {
    // mutex 적용
    if (this.flag[0] == 1) {
        // retry diff
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        // mutex on
        this.flag[0] = 1;
        var diff_directories = ' --';
        for (var i = 0; i < this.sn_options.datamap_desc.sync_interest_list.length; i++) {
            diff_directories = diff_directories + ' ' + this.sn_options.datamap_desc.sync_interest_list[i];
        }
        var git_diff = execSync('cd ' + this.pubvc_root + ' && git diff ' + topublish.previous_last_commit + ' ' + topublish.commit_number[topublish.stored - 1] + diff_directories);
        this.flag[0] = 0;
        // mutex off
        debug(git_diff);
        return git_diff;
    }
}

/// Reset count after publish
exports.Session.prototype._reset_count = function(last_commit) {
    this.count_msg = 0;
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    // 파일 초기화
    const content = {
        stored: 0,
        commit_number: [],
        previous_last_commit: lc
    }
    this.__save_dict(content);
}

// [5]: 외부 Session으로 Publish
// gRPC 전송 전용 코드
// target: Publish 받을 세션의 gRPC 서버 주소
exports.Session.prototype.Publish = function(git_patch) {
    debug("[LOG] Publish");
    // Change Log -> Now, does not send the related and filepath information through the gRPC. Subscriber extracts that information from git diff file

    // 보낼 내용 작성
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'git_patch': git_patch,
                  'receiver_id': this.session_desc.session_id
                };

    // gRPC 전송
    this.grpc_client.SessionComm(toSend, function(err, response) {
        if (err) throw err;
        if (response.transID = toSend.transID && response.result == 0) {
            debug("[LOG] Publish Communicateion Successfull");
        }
        else {
            debug("[ERROR] Error on Publish Communication");
        }
    });
}

/// (1): Subscribe from the other session
// Change Log -> seperated from the constructor as an function
exports.Session.prototype.Subscribe = function(self, call, callback) {
    debug('[LOG] Server: ' + self.id + ' gRPC Received: to ' + call.request.receiver_id);
    // 상대가 보낸 session_id가 나의 일치할 때만 처리
    if (call.request.receiver_id == self.id) {
        debug("[LOG] Git Patch Start");
        // git Patch 적용
        var result = self.gitPatch(call.request.git_patch, self);
        // ACK 전송
        // 문제 없으면 0, 오류 사항은 차차 정의
        callback(null, {transID: call.request.transID, result: result});
        // 카프카 메시지 생성 및 전송
        self.kafkaProducer(call.request.git_patch, self);
    }
}

// (2): 받은 gRPC 메시지를 갖고 자체 gitDB에 패치 적용
exports.Session.prototype.gitPatch = function(git_patch, self) {
    // git_pacth를 임시로 파일로 저장한다.
    var temp = self.rootDir + "/" + Math.random().toString(10).slice(2,3) + '.patch';
    try {
        fs.writeFileSync(temp, git_patch);
    } catch (err) {
        debug("[ERROR] ", err);
        return 1;
    }
    self.VC.apply(temp);
    // temp 파일 삭제
    fs.existsSync(temp) && fs.unlink(temp, function (err) {
        if (err) {
            debug("[ERROR] ", err);
        }
    });
    return 0;
}

// (3): Producer:asset 메시지 생성 및 전송
exports.Session.prototype.kafkaProducer = function(git_pacth, self) {
    // Change Log -> previous argument was {related, filepath} as json_string format. Now git diff
    // Change Log -> Extract the filepath and related information from the git diff string

    // get filepaths from the git_pacth
    var filepath_list = diff_parser.parse_git_patch(git_pacth);

    // 보낼 메시지 내용 - operation, id, related, content.interest, content.reference_model
    var payload_list = [];
    for (var i = 0; i < filepath_list.length; i++) {
        var filepath = filepath_list[i];
        var related = diff_parser.file_path_to_related(filepath);

        var temp = {
            "id": path.basename(filepath, '.asset'),
            "operation": "UPDATE",
            "type": "asset",
            "related": related,
            "content": fs.readFileSync(self.VC.vcRoot + '/' + filepath).toString()
        }
        payload_list.push(temp);
        debug("[LOG] Payload added " + temp.id);
    }
    
    debug('[LOG] kafka Producer start');

    var Producer = kafka.Producer;
    var client = new kafka.KafkaClient();
    var producer = new Producer(client);

    producer.on('error', function(err) {
        debug("[ERROR] kafkaproducer error");
        debug(err);
    })

    producer.on('ready', function() {
        for (var i=0; i < payload_list.length; i++) {
            var payloads = [
                { topic: 'send.asset', messages:JSON.stringify(payload_list[i])}
            ];
            producer.send(payloads, function(err, result) {
                debug('[LOG]', result);
            });
        }
    });
    debug('[LOG] kafka Producer done');
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

// Data Storing
exports.Session.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msg_storepath, contentJSON);
}

exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msg_storepath.toString()));
}

const ss = new session.Session();
