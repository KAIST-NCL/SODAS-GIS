const fs = require('fs');
const path = require('path');
const diff_parser = require('../../Lib/diff_parser');
var kafka = require('kafka-node');
const {parentPort, workerData} = require('worker_threads');
const {subscribeVC } = require('../../VersionControl/versionController')
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs')

let workerName = 'Session';
let port;

exports.Session = function () {

    parentPort.on('message', this.SMListener);

    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.sessSyncproto = this.protoDescriptor.SessionSync.SessionSyncBroker;
    console.log('[SETTING] Session Created');
    this.my_end_point = {}
    this.my_end_point.ip = workerData.my_ip;
    this.my_end_point.port = workerData.my_portNum;
    this.session_id = workerData.my_session_id;
    console.log(workerData.my_session_id + ' / ' + workerData.my_portNum)

}

// [4]: SM으로부터 메시지 받아 처리하는 코드
// 해야할 일: 절대 경로로부터 git diff 추출해내기
// 해야할 일: SM으로부터 현재 받고 있는 메시지의 카운트를 세서 일정 카운트마다 [5] 실시
// 해야할 일: SM으로부터 받고 있는 commit 번호 파일로 저장하기
exports.Session.prototype.prePublish = function(message) {
    // message로 전달받은 내용을 갖고 파일 작성 및 저장
    var content = this.__read_dict();
    content.stored = content.stored + 1;
    content.commit_number.push(message.commit_number);
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
        this.Publish(git_diff);
    });
}

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
        commit_number: [],
        previous_last_commit: lc
    }
    this.__save_dict(content);
}

// [SessionManager -> Session]
exports.Session.prototype.SMListener = function (message) {
    switch (message.event) {
        // S-Worker 초기화 event
        case 'INIT':
            console.log('[ ' + session.session_id + ' get message * INIT * ]')
            break;

        //
        case 'START_GRPC_SERVER':
            console.log('[ ' + session.session_id + ' get message * START_GRPC_SERVER * ]')
            server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
                console.log(workerName + '`s gRPC server is now working on ' + port + '!!!')
                server.start();
            });
            break;

        //
        case 'TRANSMIT_NEGOTIATION_RESULT':
            console.log('Session thread receive [TRANSMIT_NEGOTIATION_RESULT] event from SessionManager')
            console.log('[ ' + session.session_id + ' get message * TRANSMIT_NEGOTIATION_RESULT * ]')
            console.log(message.data)
            break;

    }
    self.VC.apply(temp);
    // temp 파일 삭제
    fs.existsSync(temp) && fs.unlink(temp, function (err) {
        if (err) {
            console.log("Error: ", err);
        }
    });
    return 0;
}

// (3): Producer:asset 메시지 생성 및 전송
exports.Session.prototype.kafkaProducer = function(git_pacth, self) {
    // get filepaths from the git_pacth
    var filepath_list = diff_parser.parse_git_patch(git_pacth);

    // 보낼 메시지 내용 - operation, id, related, content.interest, content.reference_model
    var payload_list = [];
    for (var i = 0; i < related_array.length; i++) {
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
        console.log("Payload added " + temp.id);
    }
    
    console.log('kafka Producer start');

    var Producer = kafka.Producer;
    var client = new kafka.KafkaClient();
    var producer = new Producer(client);

    producer.on('error', function(err) {
        console.log("kafkaproducer error");
        console.log(err);
    })

    producer.on('ready', function() {
        for (var i=0; i < payload_list.length; i++) {
            var payloads = [
                { topic: 'send.asset', messages:JSON.stringify(payload_list[i])}
            ];
            producer.send(payloads, function(err, result) {
                console.log(result);
            });
        }
    });
    console.log('kafka Producer done');
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
