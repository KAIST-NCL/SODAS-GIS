const path = require('path');
const fs = require('fs');
const debug = require('debug')('sodas:lib:git\t\t|');
const tools = require('./tools')

/**
 * 경로를 받아와 재귀적으로 폴더를 생성하는 함수
 * @param {string} pathStr 
 */
exports.mkdirSyncRecursive = function (pathStr) {
    debug('[Lib] mkdirSyncRecursive');
    var parentFolder = path.dirname(pathStr);
    if (!fs.existsSync(parentFolder)) {
        tools.mkdirSyncRecursive(parentFolder);
    }
    fs.mkdirSync(pathStr);
}