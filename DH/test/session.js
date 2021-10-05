const {Git} = require('../Lib/versionControl');
const gitDIR = "./gitDB";
let git = new Git(gitDIR);
const fs = require('fs');
const timeOut = 100;

// initialize git
git.init();
const initialCommit = git.getInitCommit();
console.log(initialCommit);

function run(pastCommitID){

    const curCommitID = git.getCurCommit();
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
setTimeout(run, timeOut, initialCommit);

