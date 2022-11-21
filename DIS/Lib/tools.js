const path = require('path');
const fs = require('fs');
const debug = require('debug')('sodas:lib:git\t\t|');
const tools = require('./tools')

exports.mkdirSyncRecursive = function (pathStr) {
    debug('[Lib] mkdirSyncRecursive');
    var parentFolder = path.dirname(pathStr);
    if (!fs.existsSync(parentFolder)) {
        tools.mkdirSyncRecursive(parentFolder);
    }
    fs.mkdirSync(pathStr);
}