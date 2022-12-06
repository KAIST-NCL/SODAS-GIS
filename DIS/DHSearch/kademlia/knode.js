/*
 * Copyright (C) 2011-2012 by Nikhil Marathe <nsm.nikhil@gmail.com>
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
"use strict";

var assert = require('assert');
var node_constants = require('constants');
var async = require('async');
var constants = require('./constants');
var util = require('./utils');
var rpc = require('./rpc');
var Bucket = require('./bucket').Bucket;
var _ = require('underscore');
var EventEmitter = require('events');
_.str = require('underscore.string');

// abbreviate message utilities
var MC = util.message_contact;
var MID = util.message_rpcID;

/**
 * KNode
 * @param desc - UDP 통신 수신자 end point
 * @constructor
 */
exports.KNode = function(desc) {
    // TODO: probably want to persist node_id
    this.self = _.defaults({ nodeID: util.nodeID(desc.address, desc.port) }, desc);

    this._storage = {};
    // object treated as an array
    this._buckets = {};
    this._rpc = new rpc.RPC(this.self, _.bind(this._onMessage, this));
    this._updateContactEvent = new EventEmitter();
}

/**
 * 분산 탐색 네트워크에서 통신하는 UDP 프로토콜 메시지 규격으로 변환해주는 함수.
 * @method
 * @private
 * @param type - UDP 메시지 type
 * @param params - 전송할 메시지
 * @returns UDP_Message
 */
exports.KNode.prototype._MSG = function(type, params) {
    // NOTE: always keep this.self last. This way users of _MSG
    // don't have to worry about accidentally overriding self properties
    return _.extend({ type: type}, params, this.self);
}

/**
 * 분산 탐색 네트워크에서 통신하는 노드 중 UDP 메시지를 수신하는 노드에서 UDP 메시지의 type 에 따라,
 * 내부 처리 함수를 호출하는 브로커 함수.
 * @method
 * @private
 * @param message - 수신한 UDP 메시지
 * @see KNode._onPing
 * @see KNode._onStore
 * @see KNode._onDelete
 * @see KNode._onFindValue
 */
exports.KNode.prototype._onMessage = function(message) {
    if (!message.type || typeof message.type !== 'string')
        return;

    var methodName = '_on' + _.str.camelize(_.str.titleize(message.type.toLowerCase()));
    var action = this[methodName];
    // console.log("action: " + methodName)
    if (action) {
        this._updateContact(MC(message));
        _.bind(action, this)(message);
    }
    else
        console.warn("Unknown message", message);
}

/**
 * 인자로 주어진 contact 객체 정보를 Bucket 에 업데이트하는 함수로,
 * contact 객체 정보가 이미 Bucket 내에 있을 경우 최신 정보로 업데이트하며,
 * contact 객체 정보가 신규 추가에 해당하고 동시에 Bucket Size 가 여유로울 때는 Bucket 에 신규 추가하며,
 * Bucket Size 가 꽉 찼을 때는 Bucket 내 노드들에게 ``PING`` 메시지를 전송해서 응답하지 않는 contact 는 제거한 뒤, 신규 contact 를 추가함.
 * @method
 * @private
 * @param contact - Bucket 에 업데이트할 contact 객체 정보
 * @param cb - callback 함수
 */
exports.KNode.prototype._updateContact = function(contact, cb) {
    if (!contact)
        return;
    var callback = cb || function() {};
    var bucketIndex = util.bucketIndex(this.self.nodeID, contact.nodeID);
    assert.ok(bucketIndex < constants.B);
    if (!this._buckets[bucketIndex])
        this._buckets[bucketIndex] = new Bucket();

    var bucket = this._buckets[bucketIndex];
    contact.lastSeen = Date.now();

    var exists = bucket.contains(contact);
    if (exists) {
        // move to the end of the bucket
        bucket.remove(contact);
        bucket.add(contact);
        // this._updateContactEvent.emit('update_contact');
        callback();
    }
    else if (bucket.size() < constants.K) {
        bucket.add(contact);
        this._updateContactEvent.emit('update_contact');
        callback();
    }
    else {
        this._rpc.send(bucket.get(0), this._MSG('PING'),
            _.bind(function(err, message) {
                if( err ) {
                    // add new contact, old one is dead
                    bucket.removeIndex(0);
                    bucket.add(contact);
                    this._updateContactEvent.emit('update_contact');
                }
                else {
                }
                callback();
            }, this)
        );
    }
}

// TODO: handle large values which
// won't fit in single UDP packets
/**
 * 수신한 UDP 메시지의 type 이 ``PING`` 에 해당할 때 호출되는 함수로,
 * 분산 탐색 네트워크의 노드 간 네트워크 연결 여부를 확인하는 통신에 해당함.
 * @method
 * @private
 * @param message - 수신한 UDP 메시지
 */
exports.KNode.prototype._onPing = function(message) {
    // this can be made more intelligent such that
    // if an outgoing message is present, piggyback the pong
    // onto it rather than sending it separately
    this._rpc.send(MC(message), this._MSG('PONG', {'replyTo': MID(message)}));
}

/**
 * 수신한 UDP 메시지의 type 이 ``STORE`` 에 해당할 때 호출되는 함수로,
 * 특정 contact 정보를 key, value 로 저장하는 통신에 해당함.
 * @method
 * @private
 * @param message - 수신한 UDP 메시지
 * @see KNode.set
 */
exports.KNode.prototype._onStore = function(message) {
    if (!message.key || message.key.length !== constants.B/4)
        return;
    if (!message.value)
        return;
    this._storage[message.key] = _.clone(message.value);
    this._rpc.send(MC(message), this._MSG('STORE_REPLY', {
        'replyTo': MID(message),
        'status': true
    }));
}

/**
 * 수신한 UDP 메시지의 type 이 ``STORE_REPLY`` 에 해당할 때 호출되는 함수로,
 * ``STORE`` 통신의 응답에 해당함.
 * @method
 * @private
 * @see KNode._onStore
 */
exports.KNode.prototype._onStoreReply = function() {}

/**
 * 수신한 UDP 메시지의 type 이 ``DELETE`` 에 해당할 때 호출되는 함수로,
 * 메시지 내 contact 객체 정보를 Bucket 내에서 삭제하는 통신에 해당함.
 * @method
 * @private
 * @param message - 수신한 UDP 메시지
 */
exports.KNode.prototype._onDelete = function(message) {
    var bucketIndex = util.bucketIndex(this.self.nodeID, message.contact.nodeID);
    assert.ok(bucketIndex < constants.B);
    if (!this._buckets[bucketIndex])
        this._buckets[bucketIndex] = new Bucket();

    var bucket = this._buckets[bucketIndex];

    var exists = bucket.contains(message.contact);
    if (exists) {
        bucket.remove(message.contact);
        if (message.isDisStop) {
            this._updateContactEvent.emit('update_contact');
        }
    }
}

/**
 * 수신한 UDP 메시지의 type 이 ``FIND_VALUE`` 에 해당할 때 호출되는 함수로,
 * message.key 값에 해당하는 value(contact 객체 정보)를 반환하는 통신에 해당함.
 * @method
 * @private
 * @param message - 수신한 UDP 메시지
 */
exports.KNode.prototype._onFindValue = function(message) {
    if (!message.key || message.key.length !== constants.B/4)
        return;
    if (this._storage.hasOwnProperty(message.key)) {
        this._rpc.send(MC(message), this._MSG('FIND_VALUE_REPLY', {
            'replyTo': MID(message),
            'found': true,
            'value': this._storage[message.key]
        }));
    }
    else {
        var messageContact = MC(message);
        if (!messageContact)
            return;
        var contacts = this._findClosestNodes(message.key, constants.K, MC(message).nodeID);

        this._rpc.send(MC(message), this._MSG('FIND_NODE_REPLY', {
            'replyTo': MID(message),
            'contacts': contacts
        }));
    }
}

/**
 * 수신한 UDP 메시지의 type 이 ``FIND_NODE`` 에 해당할 때 호출되는 함수로,
 * message.key 와 XOR 거리 기반 가까운 노드들의 정보(contacts)를 반환하는 통신에 해당함.
 * @method
 * @private
 * @param message - 수신한 UDP 메시지
 */
exports.KNode.prototype._onFindNode = function(message) {
    if (!message.key || message.key.length !== constants.B/4 || !MC(message))
        return;

    var contacts = this._findClosestNodes(message.key, constants.K, MC(message).nodeID);

    this._rpc.send(MC(message), this._MSG('FIND_NODE_REPLY', {
        'replyTo': MID(message),
        'contacts': contacts
    }));
}

/**
 * Bucket 내 XOR 거리를 비교할 key 값과의 거리가 가까운 노드들의 정보(contacts)를 반환함.
 * @method
 * @private
 * @param key - XOR 거리를 비교할 key 값
 * @param howMany - contact 를 저장할 수 있는 contacts 의 최대 크기
 * @param exclude - 비교 대상에서 제외할 nodeID(노드 자기 자신에 해당할 경우 제외.)
 * @returns contacts
 */
exports.KNode.prototype._findClosestNodes = function(key, howMany, exclude) {
    var contacts = [];
    function addContact(contact) {
        if (!contact)
            return;

        if (contacts.length >= howMany)
            return;

        if (contact.nodeID == exclude)
            return;

        contacts.push(contact);
    }

    function addClosestFromBucket(bucket) {
        var distances = _.map(bucket.contacts(), function(contact) {
            return {
                distance: util.distance(contact.nodeID, key),
                contact: contact
            };
        });

        distances.sort(function(a, b) {
            return util.buffer_compare(a.distance, b.distance);
        });

        _(distances).chain()
            .first(howMany - contacts.length)
            .pluck('contact')
            .map(MC)
            .value()
            .forEach(addContact);
    }

    // first check the same bucket
    // what bucket would key go into, that is the closest
    // bucket we start from, hence bucketIndex
    // is with reference to self.node_id
    var bucketIndex = util.bucketIndex(this.self.nodeID, key);
    if (this._buckets.hasOwnProperty(bucketIndex))
        addClosestFromBucket(this._buckets[bucketIndex]);

    var oldBucketIndex = bucketIndex;
    // then check buckets higher up
    while (contacts.length < howMany && bucketIndex < constants.B) {
        bucketIndex++;
        if (this._buckets.hasOwnProperty(bucketIndex))
            addClosestFromBucket(this._buckets[bucketIndex]);
    }

    // then check buckets lower down
    // since Kademlia does not define the search strategy, we can cheat
    // and use this strategy although it may not actually return the closest
    // FIXME: be intelligent to choose actual closest
    bucketIndex = oldBucketIndex;
    while (contacts.length < howMany && bucketIndex >= 0) {
        bucketIndex--;
        if (this._buckets.hasOwnProperty(bucketIndex))
            addClosestFromBucket(this._buckets[bucketIndex]);
    }
    return contacts;
}

/**
 * 새로운 contact 가 Bucket 에 추가되면서, Bucket 내 contact 간 XOR 거리 기반 가까운 순으로 재정렬하는 함수.
 * @method
 * @private
 * @param bucketIndex
 * @param callback - callback 함수
 */
exports.KNode.prototype._refreshBucket = function(bucketIndex, callback) {
    var random = util.randomInBucketRangeBuffer(bucketIndex);
    this._iterativeFindNode(random.toString('hex'), callback);
}

// cb should be function(err, type, result)
// where type == 'VALUE' -> result is the value
//       type == 'NODE'  -> result is [list of contacts]
/**
 * 분산 탐색 네트워크를 순회하면서 key 값에 해당하는 contact 객체를 탐색하면서, mode(``NODE``, ``VALUE``)에 따라
 * UDP 통신을 전송하는 함수.
 * @method
 * @private
 * @param key - 조회할 key or 노드 ID 값
 * @param mode - ``NODE``, ``VALUE``
 * @param cb - callback 함수
 *
 */
exports.KNode.prototype._iterativeFind = function(key, mode, cb) {
    assert.ok(_.include(['NODE', 'VALUE'], mode));
    var externalCallback = cb || function() {};

    var closestNode = null, previousClosestNode = null;
    var closestNodeDistance = -1;
    var shortlist = this._findClosestNodes(key, constants.ALPHA, this.self.nodeID);
    var contacted = {};
    var foundValue = false;
    var value = null;
    var contactsWithoutValue = [];
    closestNode = shortlist[0];
    if (!closestNode) {
        // we aren't connected to the overlay network!
        externalCallback({ message: 'Not connected to overlay network. No peers.'}, mode, null);
        return;
    }
    closestNodeDistance = util.distance(key, closestNode.nodeID);

    function xyz(alphaContacts) {
        // clone because we're going to be modifying inside
        async.forEach(alphaContacts, _.bind(function(contact, callback) {

            this._rpc.send(contact, this._MSG('FIND_'+mode, {
                key: key
            }), _.bind(function(err, message) {
                if (err) {
                    console.log("ERROR in iterativeFind"+_.str.titleize(mode)+" send to", contact);
                    shortlist = _.reject(shortlist, function(el) { return el.nodeID == contact.nodeID; });
                }
                else {
                    this._updateContact(contact);
                    contacted[contact.nodeID] = true;
                    var dist = util.distance(key, contact.nodeID);
                    if (util.buffer_compare(dist, closestNodeDistance) == -1) {
                        previousClosestNode = closestNode;
                        closestNode = contact;
                        closestNodeDistance = dist;
                    }

                    if (message.found && mode == 'VALUE') {
                        foundValue = true;
                        value = message.value;
                    }
                    else {
                        if (mode == 'VALUE') {
                            // not found, so add this contact
                            contactsWithoutValue.push(contact);
                        }
                        shortlist = shortlist.concat(message.contacts);
                        shortlist = _.uniq(shortlist, false /* is sorted? */, function(contact) {
                            return contact.nodeID;
                        });
                    }
                }
                callback();
            }, this));
        }, this), _.bind(function(err) {
            if (foundValue) {
                var thisNodeID = this.self.nodeID;

                var distances = _.map(contactsWithoutValue, function(contact) {
                    return {
                        distance: util.distance(contact.nodeID, thisNodeID),
                        contact: contact
                    };
                });

                distances.sort(function(a, b) {
                    return util.buffer_compare(a.distance, b.distance);
                });

                if (distances.length >= 1) {
                    var closestWithoutValue = distances[0].contact;

                    var message = this._MSG('STORE', {
                        'key': key,
                        'value': value
                    });
                    this._rpc.send(closestWithoutValue, message);
                }
                externalCallback(null, 'VALUE', value);
                return;
            }

            if (closestNode == previousClosestNode || shortlist.length >= constants.K) {
                // TODO: do a FIND_* call on all nodes in shortlist
                // who have not been contacted
                externalCallback(null, 'NODE', shortlist);
                return;
            }

            var remain = _.reject(shortlist, function(el) { return contacted[el.nodeID]; })
            if (remain.length == 0)
                externalCallback(null, 'NODE', shortlist);
            else
                _.bind(xyz, this)(_.first(remain, constants.ALPHA));
        }, this));
    }
    _.bind(xyz, this)(shortlist);
}

/**
 * 분산 탐색 네트워크를 순회하면서 노드 ID 값에 해당하는 contact 객체를 탐색하는 함수.
 * @method
 * @private
 * @param nodeID - 조회할 contact 노드 ID
 * @param cb - callback 함수
 * @see KNode.set
 */
exports.KNode.prototype._iterativeFindNode = function(nodeID, cb) {
    this._iterativeFind(nodeID, 'NODE', cb);
}

//  * this does not map over directly to the spec
//  * rather iterativeFind already does the related things
//  * if the callback gets a list of contacts, it simply
//  * assumes the key does not exist in the DHT (atleast with
//  * available knowledge)
/**
 * 분산 탐색 네트워크를 순회하면서 key 값에 해당하는 value(contact 객체 정보)를 탐색하는 함수.
 * @method
 * @private
 * @param key - 조회할 contact 객체 정보에 해당하는 key 값
 * @param cb - callback 함수
 * @see KNode.get
 */
exports.KNode.prototype._iterativeFindValue = function(key, cb) {
    var callback = cb || function() {};
    this._iterativeFind(key, 'VALUE', _.bind(function(err, type, result) {
        if (type == 'VALUE')
            callback(null, result);
        else
            callback({
                'code': 'NOTFOUND',
                'key': key
            }, null);
    }, this));
}

/**
 * 분산 탐색 네트워크에 등록될 자신의 노드 정보를 문자열로 변환한 뒤 반환함.
 * @method
 * @returns string
 */
exports.KNode.prototype.toString = function() {
    return "Node " + this.self.nodeID + ":" + this.self.address + ":" + this.self.port;
}

/**
 * 디버그용 Bucket 내 contact 정보를 콘솔에 출력하는 함수.
 * @method
 */
exports.KNode.prototype.debug = function() {
    console.log(this.toString());
    _(this._buckets).each(function(bucket, j) {
        console.log("bucket", j, bucket.toString());
    });
    console.log("store", this._storage);
}

/**
 * 분산 탐색 네트워크에 연결하는 주요 API 로,
 * 인자로 주어진 SeedNode 리스트 정보로 contact 객체를 생성한 뒤,
 * 해당 contact 객체의 end point 정보를 통한 UDP 통신 기반 분산 탐색 네트워크에 연결함.
 * @method
 * @param address - 분산 탐색 네트워크에 신규 참여할 DataHub 의 IP 주소
 * @param port - 분산 탐색 네트워크에 신규 참여할 DataHub 의 Port 번호
 * @param sl_portNum -분산 탐색 네트워크에 신규 참여할 DataHub 의 :ref:`sessionListener` gRPC 서버 Port 번호
 * @param sync_interest_list -분산 탐색 네트워크에 신규 참여할 DataHub 의 관심 동기화 수준 리스트
 * @param metadata - 분산 탐색 네트워크에 신규 참여할 DataHub 의 메타데이터
 * @param cb - callback 함수
 * @see DHSearch._discoverProcess
 */
exports.KNode.prototype.connect = function(address, port, sl_portNum, sync_interest_list, metadata, cb) {
    var callback = cb || function() {};
    assert.ok(this.self.nodeID);
    var contact = util.make_contact(address, port, sl_portNum, sync_interest_list, metadata);
    console.log("[connect function] contact:")
    console.log(contact)

    var refreshBucketsFartherThanClosestKnown = function(type, contacts, asyncCallback) {
        // FIXME: Do we update buckets or does iterativeFindNode do it?
        var leastBucket = _.min(_.keys(this._buckets));
        var bucketsToRefresh = _.filter(_.keys(this._buckets),
            function(num) { return num >= leastBucket; });
        var queue = async.queue(_.bind(this._refreshBucket, this), 1);
        _.each(bucketsToRefresh, function(bucketId) {
            // wrapper is required because the each iterator is passed
            // 3 arguments (element, index, list) and queue.push interprets
            // the second argument as a callback
            queue.push(bucketId);
        });
        asyncCallback(); // success
    }
    async.waterfall([
        _.bind(this._updateContact, this, contact), // callback is invoked with no arguments
        _.bind(this._iterativeFindNode, this, this.self.nodeID), // callback is invoked with
                                                                 // type (NODE) and shortlist,
                                                                 // which gets passed on to
                                                                 // refreshBucketsFartherThanClosestKnown
        _.bind(refreshBucketsFartherThanClosestKnown, this) // callback is invoked with no arguments
    ], callback);
}

/**
 * ``KNode.set`` 함수로 저장한 contact 정보를 key 값을 통해 조회하는 함수.
 * @method
 * @param key - 조회할 contact 객체 정보에 해당하는 key 값
 * @param cb - callback 함수
 * @see KNode._iterativeFindValue
 * @see KNode.set
 */
exports.KNode.prototype.get = function(key, cb) {
    var callback = cb || function() {};
    this._iterativeFindValue(util.id(key), callback);
}

/**
 * 분산 탐색 네트워크에서 key, value 값으로 특정 contact 정보를 저장하는 함수.
 * @method
 * @param key - contact 객체 정보에 해당하는 key 값
 * @param value - 저장할 contact 객체 정보
 * @param cb - callback 함수
 * @see KNode._iterativeFindNode
 * @see KNode.get
 */
exports.KNode.prototype.set = function(key, value, cb) {
    var callback = cb || function() {};
    var message = this._MSG('STORE', {
        'key': util.id(key),
        'value': value
    });
    this._iterativeFindNode(util.id(key), _.bind(function(err, type, contacts) {
        if (err) {
            callback(err);
            return;
        }
        async.forEach(contacts, _.bind(function(contact, asyncCb) {
            this._rpc.send(contact, message, function() {
                // TODO handle error
                asyncCb(null);
            });
        }, this), callback);
    }, this));
}

/**
 * 주어진 인자로 contact 객체를 생성한 뒤,
 * 분산 탐색 네트워크에 접속한 모든 데이터 허브들의 정보(Bucket 객체)를 조회하면서,
 * 생성한 contact 정보를 삭제 요청하는 UDP 통신을 전송함.
 * @method
 * @param address - 분산 탐색 네트워크에 신규 참여할 DataHub 의 IP 주소
 * @param port - 분산 탐색 네트워크에 신규 참여할 DataHub 의 Port 번호
 * @param sl_portNum -분산 탐색 네트워크에 신규 참여할 DataHub 의 :ref:`sessionListener` gRPC 서버 Port 번호
 * @param sync_interest_list -분산 탐색 네트워크에 신규 참여할 DataHub 의 관심 동기화 수준 리스트
 * @param metadata - 분산 탐색 네트워크에 신규 참여할 DataHub 의 메타데이터
 * @param isDisStop - Bucket 정보 업데이트 Notification 간결화를 위한 Boolean
 * @param cb - callback 함수
 * @see DHSearch._dhDaemonListener
 * @see DHSearch._deleteMyInfoFromKademlia
 */
exports.KNode.prototype.delete = function(address, port, sl_portNum, sync_interest_list, metadata, isDisStop, cb) {
    var callback = cb || function() {};
    var contact = util.make_contact(address, port, sl_portNum, sync_interest_list, metadata);

    var message = this._MSG('DELETE', {
        'contact': contact,
        'isDisStop': isDisStop
    });

    async.forEach(this._buckets, _.bind(function(contact, asyncCb) {
        for (var i=0; i<contact._contacts.length; i++){
            this._rpc.send(contact._contacts[i], message, function() {
                // TODO handle error
                asyncCb(null);
            });
        }
    }, this), callback);
    if (isDisStop) {
        this._buckets = {};
        this._updateContactEvent.emit('update_contact');
    }
}
