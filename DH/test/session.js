const {Git} = require('../Lib/versionControl');
// const gitDIR = "../VersionControl/";
const gitDIR = "/Users/yang-eunju/DEV/gitDBTest";
let git = new Git(gitDIR);
const fs = require('fs');
const timeOut = 100;
const currentCommitID = '79565908db44093524543266965c586a63d11136';

// initialize git
git.init();

function run(pastCommitID){

    const curCommitID = git.curCommit();
    const diff_dir = gitDIR;
    if(curCommitID === pastCommitID){
        setTimeout(run, timeOut, curCommitID);
        return;
    }
    console.time('diff_process ' + curCommitID);
    const diff_file = git.diff(pastCommitID, curCommitID, diff_dir);
    fs.writeFile('./'+curCommitID + '.diff', diff_file, function(){
        console.log('complete to write');
        console.timeEnd('diff_process ' + curCommitID);
    });
    setTimeout(run, timeOut, curCommitID);
}
setTimeout(run, timeOut, currentCommitID);

