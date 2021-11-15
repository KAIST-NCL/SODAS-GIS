
const PROTO_PATH = __dirname+'/../proto/sessionNegotiation.proto';
const {parentPort, workerData} = require('worker_threads');
const sr = require(__dirname+'/sessionRequester');
const policy = require(__dirname+'/../api/sync_policy');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const workerName = 'SessionRequester';

exports.SessionRequester = function () {

    self = this;
    parentPort.on('message', function(message) {self._smListener(message)});

    this.my_session_desc = {};
    this.my_end_point = {};

    this.my_session_desc.session_creator = workerData.dh_id;
    this.sn_options = workerData.sn_options;

    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.SNproto = this.protoDescriptor.sessionNegotiation.SessionNegotiationBroker;
    console.log('[SETTING] SessionRequester Created');

}
exports.SessionRequester.prototype.run = function () {
    console.log('[SETTING] SessionRequester is running');
}

/* Worker threads Listener */
exports.SessionRequester.prototype._smListener = function (message) {
    switch (message.event) {
        case 'INIT':
            console.log('[ ' + workerName + ' get message * INIT * ]');
            this.run();
            break;
        case 'START_SESSION_CONNECTION':
            console.log('[ ' + workerName + ' get message * START_SESSION_CONNECTION * ]');
            this._snProcess(message.data);
            break;
        case 'GET_NEW_SESSION_INFO':
            console.log('[ ' + workerName + ' get message * GET_NEW_SESSION_INFO * ]');
            console.log(message.data)
            this.my_session_desc.session_id = message.data.sess_id;
            this.my_end_point.ip = message.data.sess_ip;
            this.my_end_point.port = message.data.sess_portNum;
            break;
        case 'UPDATE_NEGOTIATION_OPTIONS':
            console.log('[ ' + workerName + ' get message * UPDATE_NEGOTIATION_OPTIONS * ]');
            this.sn_options = message.data
            break;
    }
}

/* SessionManager methods */
exports.SessionRequester.prototype._smTransmitNegotiationResult = function (end_point, session_desc, negotiation_result) {
    parentPort.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { end_point: end_point, session_desc: session_desc, negotiation_result: negotiation_result }
    });
}

/* SessionRequester methods */
exports.SessionRequester.prototype._initConnection = function (sl_ip) {
    return new this.SNproto(sl_ip, grpc.credentials.createInsecure());
}
exports.SessionRequester.prototype._closeConnection = function () {
    grpc.closeClient(this.sessionNegotiationClient);
    console.log('gRPC session closed with other datahub SessionListener');
}
exports.SessionRequester.prototype._snProcess = async function (bucketList) {

    // todo: session 생성되어 있어야함. 즉, session_desc.session_id 가 null 이 아닐 경우 진행. null 이면 wait
    // todo: 한번에 한번 request 요청 전송함. 끝나고 다음 요청 전송

    const promiseFunc = (node) => {
        return new Promise((resolve, reject) => {
            setTimeout(async function checkCreateTempSession() {
                console.log(node);
                let sl_addr = node.address + ':' + node.port;
                sessionRequester.sessionNegotiationClient = await sessionRequester._initConnection(sl_addr);
                console.log("--=-=-=-=- test -=-=-=-=-");
                console.log(sessionRequester.my_session_desc.session_id);
                if ( sessionRequester.my_session_desc.session_id == null ) {
                    console.log("srTempSession is not yet Created")
                    setTimeout(checkCreateTempSession, 1000);
                }
                else {
                    await sessionRequester.sessionNegotiationClient.RequestSessionNegotiation(
                        {session_desc: sessionRequester.my_session_desc, sn_options: sessionRequester.sn_options}, (error, response) => {
                            if (!error) {
                                console.log('Request Session Negotiation to ' + node.port);
                                if (response.status) {
                                    console.log('Session Negotiation Completed!!');
                                    sessionRequester._smTransmitNegotiationResult(response.end_point, response.session_desc, response.sn_options)
                                    sessionRequester.my_session_desc.session_id = null;
                                    console.log(sessionRequester.my_session_desc.session_id)
                                    sessionRequester.sessionNegotiationClient.AckSessionNegotiation({status: true, end_point: sessionRequester.my_end_point}, (error, response) => {
                                        if (!error) {
                                            console.log('Ack Session Negotiation to ' + node.port);
                                        } else {
                                            console.error(error);
                                        }
                                    });
                                }
                            } else {
                                console.error(error);
                            }
                        });
                }
                await sessionRequester._closeConnection();
                resolve(node.port + '와의 세션 협상 종료 =========================')
            }, 2000);
        })
    }

    for (let key in bucketList) {
        for (let i = 0; i < bucketList[key].length; i++) {
            const result = await promiseFunc(bucketList[key][i]);
            console.log(result);
        }
    }
}

const sessionRequester = new sr.SessionRequester();
