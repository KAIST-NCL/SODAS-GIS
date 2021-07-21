
const {Worker} = require('worker_threads')
const sm = require('./session_manager');


exports.SessionManager = function(port) {
    // this.self = _.defaults({ nodeID: util.nodeID(desc.address, desc.port) }, desc);
    // Object.freeze(this.self);

    this.sessionListenerWorker = { key: null, worker: this.init_session_listener(port), status: null }
    this.sessionRequestWorker = { key: null, worker: this.init_session_request(), status: null }

}
exports.SessionManager.prototype.init_session_request = function () {
    return new Worker('./thread/session_request.js');
}

exports.SessionManager.prototype.init_session_listener = function (port) {
    const worker = new Worker('./thread/session_listener.js')
    worker.postMessage(port);
    return worker
}

const session_manager = new sm.SessionManager('127.0.0.1:9000')

console.log(session_manager)
