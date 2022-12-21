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
const debug = require('debug')('sodas:session\t\t|');
const tools = require('../../Lib/tools');

/// Constructor
// workerData -> my_session_id, my_ip, my_portNum

/**
 * Session
 * @constructor
 */
exports.Session = function() {
    debug("[LOG-Session:" + workerData.mySessionId + "]: Session is Created");
    debug("[LOG-Session:" + workerData.mySessionId + "]:");
    debug(workerData);
    this.countMsg = 0;

    this.kafka = workerData.kafka;
    this.pubvcRoot = workerData.pubvcRoot;
    // Root Dir Creation
    this.id = workerData.mySessionId;
    this.rootDir = workerData.subvcRoot+'/'+this.id;
    !fs.existsSync(this.rootDir) && tools.mkdirSyncRecursive(this.rootDir);

    // Settings for storing thread call information
    this.msgStorepath = this.rootDir+'/msgStore.json'
    this.lastCommitTime = new Date().getTime();
    this.timeOut = 5;

    // Settings for GitDB
    this.VC = new subscribeVC(this.rootDir+'/gitDB');
    this.VC.init();

    // Mutex_Flag for Git
    this.flag = workerData.mutexFlag; // mutex flag

    // FirstCommit Extraction from PubVC
    this._reset_count(this.VC.returnFirstCommit(this.VC, this.pubvcRoot));

    // Run gRPC Server
    this.ip = workerData.myIp;
    this.myPort = workerData.myPortNum;
    this.server = new grpc.Server();
    self = this;
    parentPort.on('message', function(message) {self._smListener(message)});

    this.server.addService(session_sync.SessionSync.service, {
        // (1): Subscription from counter session
        SessionComm: (call, callback) => {
            self.Subscribe(self, call, callback);
        }
    });
}

/**
 * :ref:`sessionManager` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ``INIT``, ``TRANSMIT_NEGOTIATION_RESULT``, ``UPDATE_PUB_ASSET``
 * @see SessionManager._sessionInit
 * @see SessionManager._sessionTransmitNegotiationResult
 * @see SessionManager._sessionUpdatePubAsset
 */
exports.Session.prototype._smListener = function (message) {
    debug("[Session ID: " + this.id + "] Received Thread Msg ###");
    debug(message);
    switch(message.event) {
        // Information to init the Session
        case 'INIT':
            this._init(this);
            break;
        // Information about counter session
        case 'TRANSMIT_NEGOTIATION_RESULT':
            // Get the counter session's address + port
            this.target = message.data.endPoint.ip + ':' + message.data.endPoint.port;
            debug("[Session ID: " + this.id + "] Target:" + this.target);
            // gRPC client creation
            this.grpc_client = new session_sync.SessionSync(this.target, grpc.credentials.createInsecure());
            this.sessionDesc = message.data.sessionDesc;
            this.snOptions = message.data.snOptions; // sync_interest_list, data_catalog_vocab, sync_time, sync_count, transfer_interface
            this.run(this);
            break;
        // Things to publsih
        case 'UPDATE_PUB_ASSET':
            this.countMsg += 1;
            this.prePublish(this, message.data);
            break;
    }
}


/**
 * gRPC 모듈 활성화 함수
 * @method
 * @private
 */
exports.Session.prototype._init = function(self) {
    const addr = self.ip+':'+self.myPort;
    self.server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), ()=> {
        self.server.start();
    });
}

/**
 * git Diff를 Publish하기 전에 내부 변수를 업데이트, 저장하고 publish 조건이 충족되었는 지 확인하는 함수
 * @method
 * @private
 */
exports.Session.prototype.prePublish = function(self, message) {
    var content = self.__read_dict();
    content.stored = content.stored + 1;
    content.commitNumber.push(message.commitNumber);
    self.__save_dict(content);
    if (self.countMsg >= self.snOptions.syncDesc.syncCount[0]) {
        debug("[LOG-Session:" + self.id + "]: Sync_count reached - clearTime Out");
        clearTimeout(self.setTimeoutID);
        self.run(self);
    }
}


/**
 * 만약 sync_count에 도달하면 count를 초기화하고 diff를 추출한다
 * @method
 * @private
 * @see Session._reset_count
 * @see Session.extractGitDiff
 */
exports.Session.prototype.onMaxCount = async function(self) {
    self.countMsg = 0;
    debug("[LOG-Session:" + self.id + "]: onMaxCount");
    // Read file first and reset the file
    const topublish = self.__read_dict();
    self._reset_count(topublish.commitNumber[topublish.commitNumber.length - 1]);
    // git diff extraction
    self.extractGitDiff(self, topublish)
}

/**
 * git Diff를 추출하는 함수
 * @method
 * @private
 * @param {Session} self
 * @param {dictionary(previousLastCommit, commitNumber)} topublish - diff 추출에 필요한 정보가 담긴 함수
 * @param {string} topublish:previousLastCommit - 이전 publish 때 사용한 마지막 commit 번호
 * @param {Array} topublish:commitNumber - 이전 publish 이후 들어온 commit 번호의 배열
 * @see Session.Publish
 */
exports.Session.prototype.extractGitDiff = async function(self, topublish) {
    // mutex 적용
    debug("[LOG-Session:" + self.id + "]: gitDiff mutex - " + self.flag[0])
    if (self.flag[0] == 1) {
        // retry diff
        const timeOut = 100;
        setTimeout(self.extractGitDiff.bind(self), timeOut, self, topublish);
    }
    else {
        // mutex on
        self.flag[0] = 1;
        var diff_directories = ' --';
        for (var i = 0; i < self.snOptions.datamapDesc.syncInterestList.length; i++) {
            diff_directories = diff_directories + ' ' + self.snOptions.datamapDesc.syncInterestList[i];
        }
        var git_diff = execSync('cd ' + self.pubvcRoot + ' && git diff --no-color ' + topublish.previousLastCommit + ' ' + topublish.commitNumber[topublish.stored - 1] + diff_directories);
        // mutex off
        self.flag[0] = 0;
        // Send gRPC message
        if (git_diff) self.Publish(git_diff);
    }
}

/**
 * sync_count를 초기화하는 함수
 * @method
 * @private
 */
exports.Session.prototype._reset_count = function(last_commit) {
    this.countMsg = 0;
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    // 파일 초기화
    const content = {
        stored: 0,
        commitNumber: [],
        previousLastCommit: lc
    }
    this.__save_dict(content);
}

/**
 * 추출한 git Diff를 상대 session에게 publish하는 함수
 * @method
 * @private
 * @param {string} git_patch - git Diff 추출물
 */
exports.Session.prototype.Publish = function(git_patch) {
    debug("[LOG-Session:" + ss.id + "]: Publish");
    // Make the message body to send
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'gitPatch': git_patch,
                  'receiverId': this.sessionDesc.sessionId};

    // gRPC transmittion
    this.grpc_client.SessionComm(toSend, function(err, response) {
        if (err) throw err;
        if (response.transID = toSend.transID && response.result == 0) {
            debug("[LOG-Session:" + ss.id + "]:  gRPC publish communication is completed");
        }
        else {
            debug("[ERROR-Session:" + ss.id + "]:  gRPC publish communication ");
        }
    });
}

/**
 * 상대 Session으로부터 gRPC를 통해 git Diff 내용을 받아와 적용하고 Kafka로 해당 내용을 외부에 전달하는 함수
 * @method
 * @private
 * @param {Session} self
 * @param {dictionary} call - Kafka로 전달받은 내용
 * @param callback - Kafka response를 처리하는 콜백 함수
 * @see Session.gitPatch
 * @see Session.kafkaProducer
 */
exports.Session.prototype.Subscribe = function(self, call, callback) {
    debug("[LOG-Session:" + self.id + "]: gRPC Received: from " + call.request.receiverId);
    // Only process the things when sender's id is the same one with the counter session's id
    if (call.request.receiverId == self.id) {
        debug("[LOG-Session:" + self.id + "]: start to apply GitPatch");
        // git Patch apply
        var result = self.gitPatch(call.request.gitPatch, self);
        // ACK Transimittion
        // If no problem, result is 0. Otherwise is not defined yet.
        callback(null, {transID: call.request.transID, result: result})
        // Producing the Kafka message and publish it.
        self.kafkaProducer(call.request.gitPatch, self);
    }
}

/**
 * 상대 Session으로부터 전달받은 git Diff를 자신의 gitDB에 적용하는 함수
 * @method
 * @private
 * @param {string} git_patch - git Diff 추출물
 * @param {session} self
 * @returns - 1인 경우 에러, 0인 경우 정상 동작
 */
exports.Session.prototype.gitPatch = function(git_patch, self) {
    // save git patch as a temporal file
    var patch = Math.random().toString(10).slice(2,5) + '.patch';
    var temp = self.rootDir + "/" + patch;
    try {
        fs.writeFileSync(temp, git_patch);
    } catch (err) {
        debug("[ERROR" + self.id + "]:", err);
        return 1;
    }
    self.VC.apply("../" + patch);
    // remove the temporal file
    fs.existsSync(temp) && fs.unlink(temp, function (err) {
        if (err) {
            debug("[ERROR" + self.id + "]:", err);
        }
    });
    return 0;
}

/**
 * 외부에 Kafka 메시지를 발행하는 함수
 * @method
 * @private
 * @param {string} git_patch - git Diff 추출물
 * @param {session} self
 */
exports.Session.prototype.kafkaProducer = function(git_pacth, self) {
    // Change Log -> previous argument was {related, filepath} as json_string format. Now git diff
    // Change Log -> Extract the filepath and related information from the git diff string

    // get filepaths from the git_pacth
    var filepath_list = diff_parser.parse_git_patch(git_pacth);

    // Things to send - operation, id, related, content
    var payload_list = [];
    for (var i = 0; i < filepath_list.length; i++) {
        var filepath = filepath_list[i];

        var msg_ = JSON.parse(fs.readFileSync(self.VC.vcRoot + '/' + filepath).toString())

        var temp = msg_
        payload_list.push(temp);
    }

    var Producer = kafka.Producer;
    var client = new kafka.KafkaClient({kafkaHost: this.kafka});
    var producer = new Producer(client);

    payload_list.forEach((payload) => {
        var payloads = [{topic: 'recv.asset', messages: JSON.stringify(payload), partition: 0}];
        producer.send(payloads, function(err, data){
            if(err) debug(err);
        });
    })

    debug("[LOG-Session:" + self.id + "]: Kafka producer completed ");
}

/**
 * session 내 변수를 파일로 저장하는 함수
 * @method
 * @private
 * @param {dictionary} content
 */
exports.Session.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msgStorepath, contentJSON);
}
/**
 * JSON으로 저장된 session 내부 변수를 불러오는 함수
 * @method
 * @private
 */
exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msgStorepath).toString());
}

/**
 * Session 동작 함수
 * sync_count 혹은 sync_time 도달 시 Publish하도록 한다
 * @method
 * @private
 * @param {Session} self
 */
exports.Session.prototype.run = function(self) {
    now = new Date().getTime();
    var condition_time = self.countMsg >= 1 && now - self.lastCommitTime >= self.snOptions.syncDesc.syncTime[0];
    var condition_count = (self.countMsg >= self.snOptions.syncDesc.syncCount[0]);
    if (condition_time || condition_count) {
        // Sync_time 초과 시 강제 진행
        self.onMaxCount(self);
    }
    setTimeout(self.run, self.timeOut, self);
}

const ss = new session.Session();
