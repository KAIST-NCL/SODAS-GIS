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
};

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
};

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
};

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
};

// msg type for Asset
exports.assethandler = async function(operation, related, id, contents, gitDIR, git) {
    // make the folder directory string from the related. </Domain/Taxonomy/Category/>
    var folder = '/' + related.domain + '/' + related.taxonomy + '/';
    related.category.forEach(function(item, index) {
        folder = folder + item + '/';
    });

    // first create/delete the asset in the proper folder
    if (operation == 'UPDATE' || operation == 'CREATE') {
        vc.file_manager(vc.EDIT, gitDIR, folder, id, contents)
    }
    else if (operation == 'DELETE') {
        vc.file_manager(vc.DEL, gitDIR, folder, id, contents)
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

};

function errorhandler() {
    console.log('undefined operation and type combination.')
}
