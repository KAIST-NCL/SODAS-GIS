// Define the msg handlers for each message operation here
var vc = require('./versionControl');

// msg type reference-model
exports.refmodelhandler = function(operation) {
    if (operation == 'start') {

    }
    else if (operation == 'stop') {
        
    }
    else {
        // error case
        errorhandler();
    }
}

// msg type domain
exports.domainhandler = function(operation) {
    if (operation == 'create') {

    }
    else if (operation == 'update') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type domain-version
exports.domverhandler = function(operation) {
    if (operation == 'create') {

    }
    else if (operation == 'update') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type datahub
exports.datahubhandler = function(operation) {
    if (operation == 'start') {

    }
    else if (operation == 'stop') {

    }
    else if (operation == 'update') {

    }
    else if (operation == 'sync_on') {

    }
    else if (operation == 'sync_off') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type domain-asset
exports.domassethandler = function(operation) {
    if (operation == 'update') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type taxonomy-asset
exports.taxassethandler = function(operation) {
    if (operation == 'update') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type category-asset
exports.categassethandler = function(operation) {
    if (operation == 'update') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type catalog-asset
exports.catalassethandler = function(operation) {
    if (operation == 'update') {

    }
    else {
        // error case
        errorhandler();
    }
}

// msg type catalog
exports.cataloghandler = function(operation) {
    if (operation == 'create') {

    }
    else if (operation == 'update') {

    }
    else if (operation == 'delete') {

    }
    else {
        // error case
        errorhandler();
    }
}


// msg type for Asset
exports.assethandler = function(operation, hierarchy, id, contents, gitDIR, git) {
    // first create/delete the asset in the proper folder
    if (operation == 'update' || operation == 'create') {
        vc.file_manager(vc.EDIT, gitDIR, hierarchy, id, contents)
    }
    else if (operation == 'delete') {
        vc.file_manager(vc.DEL, gitDIR, hierarchy, id, contents)
    }
    else {
        // this is error case
        errorhandler();
        return;
    }
    // then commit
    var comm_commit = 0;
    await vc.commit(git, "create asset " + msg.id).then((comm) => comm_commit = comm.slice());
    // return the commit number to 

}

function errorhandler() {
    console.log('undefined operation and type combination.')
}