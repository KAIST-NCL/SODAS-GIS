
const PROTO_PATH = __dirname+'/../proto/sessionNegotiation.proto';
const {parentPort, workerData} = require('worker_threads');
const sr = require(__dirname+'/sessionRequester');
const policy = require(__dirname+'/../api/sync_policy');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const debug = require('debug')('sodas:sessionRequester|');


/**
 * SessionRequester
 * @constructor
 */
exports.SessionRequester = function () {

    self = this;
    parentPort.on('message', function(message) {self._smListener(message)});

    this.mySessionDesc = {};
    this.myEndPoint = {};

    this.mySessionDesc.sessionCreator = workerData.myNodeId;
    this.snOptions = workerData.snOptions;

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

    debug('[SETTING] SessionRequester Created');

}
/**
 * @method
 * @private
 */
exports.SessionRequester.prototype.run = function () {
    debug('[SETTING] SessionRequester is running');
}

/* Worker threads Listener */
/**
 * _smListener
 * @method
 * @private
 * @see SessionManager._srInit
 * @see SessionManager._srStartSessionConnection
 * @see SessionManager._srGetNewSessionInfo
 * @see SessionManager._srUpdateInterestList
 * @see SessionManager._srUpdateNegotiationOptions
 */
exports.SessionRequester.prototype._smListener = function (message) {
    switch (message.event) {
        case 'INIT':
            debug('[RX: INIT] from SessionManager');
            this.run();
            break;
        case 'START_SESSION_CONNECTION':
            debug('[RX: START_SESSION_CONNECTION] from SessionManager')
            debug(message.data);
            this._snProcess(message.data);
            break;
        case 'GET_NEW_SESSION_INFO':
            debug('[RX: GET_NEW_SESSION_INFO] from SessionManager');
            debug(message.data)
            this.mySessionDesc.sessionId = message.data.sessId;
            this.myEndPoint.ip = message.data.sessIp;
            this.myEndPoint.port = message.data.sessPortNum;
            break;
        case 'UPDATE_INTEREST_LIST':
            debug('[RX: UPDATE_INTEREST_LIST] from SessionManager');
            this.snOptions.datamapDesc.syncInterestList = message.data.syncInterestList;
            break;
        case 'UPDATE_NEGOTIATION_OPTIONS':
            debug('[RX: UPDATE_NEGOTIATION_OPTIONS] from SessionManager');
            this.snOptions = message.data
            break;
    }
}

/* SessionManager methods */
/**
 * _smTransmitNegotiationResult
 * @method
 * @private
 * @see SessionManager._srListener
 */
exports.SessionRequester.prototype._smTransmitNegotiationResult = function (end_point, session_desc, sn_result) {
    debug('[TX: TRANSMIT_NEGOTIATION_RESULT] to SessionManager');
    parentPort.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { endPoint: end_point, sessionDesc: session_desc, snResult: sn_result }
    });
}

/* SessionRequester methods */
/**
 * @method
 * @private
 */
exports.SessionRequester.prototype._initConnection = function (sl_ip) {
    return new this.SNproto(sl_ip, grpc.credentials.createInsecure());
}
/**
 * @method
 * @private
 */
exports.SessionRequester.prototype._closeConnection = function () {
    grpc.closeClient(this.sessionNegotiationClient);
    debug('gRPC session closed with other datahub SessionListener');
}
/**
 * @method
 * @private
 */
exports.SessionRequester.prototype._snProcess = async function (bucketList) {

    // session 생성되어 있어야함. 즉, session_desc.session_id 가 null 이 아닐 경우 진행. null 이면 wait
    // 한번에 한번 request 요청 전송함. 끝나고 다음 요청 전송
    const promiseFunc = (node) => {
        return new Promise((resolve, reject) => {
            setTimeout(async function checkCreateTempSession() {
                debug(node);
                let sl_addr = node.address + ':' + node.slPortNum;
                sessionRequester.sessionNegotiationClient = await sessionRequester._initConnection(sl_addr);
                debug(sessionRequester.mySessionDesc.sessionId);
                if ( sessionRequester.mySessionDesc.sessionId == null ) {
                    debug("srTempSession is not yet Created")
                    setTimeout(checkCreateTempSession, 1000);
                }
                else {
                    await sessionRequester.sessionNegotiationClient.RequestSessionNegotiation(
                        {sessionDesc: sessionRequester.mySessionDesc, snOptions: sessionRequester.snOptions}, (error, response) => {
                            if (!error) {
                                debug('SessionRequester send RequestSessionNegotiation to SessionListener with ' + node.slPortNum);
                                if (response.status) {
                                    debug('Session Negotiation Completed!!');
                                    debug('SessionRequester thread send [TRANSMIT_NEGOTIATION_RESULT] event to SessionManager')
                                    sessionRequester._smTransmitNegotiationResult(response.endPoint, response.sessionDesc, response.snOptions)
                                    sessionRequester.mySessionDesc.sessionId = null;
                                    debug(sessionRequester.mySessionDesc.sessionId)
                                    debug('SessionRequester send CheckNegotiation to SessionListener with ' + node.slPortNum);
                                    sessionRequester.sessionNegotiationClient.AckSessionNegotiation({status: true, endPoint: sessionRequester.myEndPoint}, (error, response) => {
                                        if (!error) {
                                            debug('SessionRequester send AckSessionNegotiation to SessionListener with ' + node.slPortNum);
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
                await resolve(node.nodeID + '와의 세션 협상 종료 =========================')
            }, 2000);
        })
    }

    for (let key in bucketList) {
        for (let i = 0; i < bucketList[key]._contacts.length; i++) {
            const result = await promiseFunc(bucketList[key]._contacts[i]);
            debug(result);
        }
    }
}

const sessionRequester = new sr.SessionRequester();
