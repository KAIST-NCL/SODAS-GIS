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
var _ = require('underscore');

var constants = require('./constants');

Array.prototype.insert = function(index, value) {
    this.splice(index, 0, value);
    return this;
};

Array.prototype.remove = function(index) {
    this.splice(index, 1);
    return this;
};

/**
 * @param contact
 * @returns {*}
 */
var lastSeenIterator = function(contact) {
    return contact.lastSeen;
};

/**
 * Bucket
 * @constructor
 * @type {exports.Bucket}
 */
var Bucket = exports.Bucket = function() {
    this._contacts = [];
};

/**
 * Bucket 내 관리하고 있는 Contact List 내 contact 개수를 반환.
 * @method
 * @returns contacts.length - Contact List 내 contact 개수
 */
Bucket.prototype.size = function() {
    return this._contacts.length;
};

/**
 * Bucket 내 관리하고 있는 Contact List 객체의 clone 을 반환.
 * @method
 * @returns contacts - Contact List 객체의 clone
 */
Bucket.prototype.contacts = function() {
    return _.clone(this._contacts);
};

/**
 * Bucket 내 관리하고 있는 Contact List 의 index 번째에 해당하는 contact 객체 반환.
 * @method
 * @param index - 조회할 contact 객체의 순번
 * @returns contact - index 번째의 contact 객체
 */
Bucket.prototype.get = function(index) {
    assert.ok(index >= 0);
    assert.ok(index < constants.B);
    return this._contacts[index];
};

/**
 * contact 의 nodeID 를 이용하여 Bucket 내 관리하고 있는 Contact List 에 해당 contact 객체가 있는지 유무를 반환.
 * @method
 * @param contact - Contact List 내 포함 유무를 확인할 contact 객체
 * @returns boolean - Contact List 내 contact 객체의 포함 유무
 */
Bucket.prototype.contains = function(contact) {
    return this.findContact(contact.nodeID) != undefined;
};

/**
 * Bucket 내 관리하고 있는 Contact List 에 새로 추가될 contact 를 lastSeen 기준으로 정렬한 위치에 추가함.
 * @method
 * @param contact - 새로 추가할 contact 객체
 * @returns Bucket - 새로 추가된 contact 정보를 포함한 Bucket 객체
 */
Bucket.prototype.add = function(contact) {
    if (!this.contains(contact)) {
        var idx = _.sortedIndex(this._contacts, contact, lastSeenIterator);
        this._contacts.insert(idx, contact);
    }
    return this;
};

/**
 * Bucket 내 관리하고 있는 Contact List 에서 인자로 주어진 contact 의 nodeID 와 일치하는 contact 정보를 삭제함.
 * @method
 * @param contact - 삭제할 contact 객체
 * @returns Bucket - 인자로 주어진 contact 정보를 삭제한 Bucket 객체
 */
Bucket.prototype.remove = function(contact) {
    // removing elements DOES NOT affect the sort order
    var idx = this.indexOf(contact);
    return this.removeIndex(idx);
};

/**
 * Bucket 내 관리하고 있는 Contact List 에서 인자로 주어진 index 순번에 해당하는 contact 정보를 삭제함.
 * @method
 * @param index - 삭제할 contact 순번
 * @returns Bucket - index 순번에 해당하는 contact 정보를 삭제한 Bucket 객체
 */
Bucket.prototype.removeIndex = function(index) {
    if (index != -1)
        this._contacts.remove(index);
    return this;
};

/**
 * Bucket 내 관리하고 있는 Contact List 에서 인자로 주어진 id 와 일치하는 contact
 * @method
 * @param id - 조회할 nodeID
 * @returns contact - 주어진 id 와 일치하는 contact 객체
 */
Bucket.prototype.findContact = function(id) {
    return _.detect(this._contacts, function(contact) { return contact.nodeID == id });
};

/**
 * Bucket 내 관리하고 있는 Contact List 에서 인자로 주어진 contact 의 nodeID 와 일치하는 contact 객체의 순번을 반환함.
 * @method
 * @param contact - 순번을 조회할 contact 객체
 * @returns (number)index - Contact List 내 인자로 주어진 contact 의 nodeID 와 일치하는 contact 객체의 순번
 */
Bucket.prototype.indexOf = function(contact) {
    for (var i = 0; i < this.size(); i++)
        if (this.get(i).nodeID == contact.nodeID)
            return i;
    return -1;
};

/**
 * Bucket 내 관리하고 있는 Contact List 를 문자열로 변환한 뒤, 반환함.
 * @method
 * @returns JSON.stringify(contacts) - Contact List 의 문자열 변환값
 */
Bucket.prototype.toString = function() {
    var list = [];
    for (var i = 0; i < this.size(); i++) {
        var c = this._contacts[i];
        list.push(c);
    }
    return JSON.stringify(list, null, 2);
};
