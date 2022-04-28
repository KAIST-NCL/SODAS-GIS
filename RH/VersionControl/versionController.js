const { Git } = require(__dirname + '/../../DH/Lib/git');
const debug = require('debug')('sodas:versionController');
const fs= require('fs');
class VC {

    static Flag = false;
    static FirstCommit = 'asdfasdf';

    constructor(RMgitDir) {
        this.vcRoot = RMgitDir;
        this.git = new Git(this.vcRoot);
        this.isInit = false;
    }

    async init(){
        var value = '';
        await this.git.init()
            .then((commnum) => {
                value = (' ' + commnum).slice(1);
                fs.mkdir(this.vcRoot+'/'+'domain', function(err) {
                    if (err) {
                        console.log(err);
                    }});
                fs.mkdir(this.vcRoot+'/'+'domain_version', function(err) {
                    if (err) {
                        console.log(err);
                    }});  
            })
            .catch((e) => {debug(e)});
        this.isInit = true;
        return value;
    }

    returnFirstCommit(self, dir) {
        return self.git.getInitCommit(dir);
    }
}

class publishVC extends VC{
    // static class variable (mutex)
    constructor(RMgitDir) {
        super(RMgitDir);
    }
    async commit(filepath, message, vm){
        // Flag가 0이면 열린 상태, 1이면 잠긴 상태
        if(vm.flag[0] == 1){
            // retry commit
            const timeOut = 100;
            setTimeout(this.commit.bind(this), timeOut, filepath, message, vm);
        }else{
            // MUTEX ON
            vm.lockMutex(vm);
            debug('[PublishVC Event]: ' + message + ' - bind because of Mutex');
            var commitNum = await this.git.commit(filepath, message);
            debug(commitNum);
            // MUTEX OFF
            vm.unlockMutex(vm);
            debug('[PublishVC Event]: ' + message + ' - Mutex unlock');
            if (commitNum != '') vm.reportCommit(vm, commitNum);
        }
    }
}

class subscribeVC extends VC{
    constructor(RMgitDir) {
        super(RMgitDir);
    }
    
    async commit(filepath, message){
        // commit 처리할 때 mutex 없게 수정해야함
        await this.git.commit(filepath, message);
    }

    apply(gitPatch) {
        this.git.apply(gitPatch);
    }
}


exports.VC = VC;
exports.publishVC = publishVC;
exports.subscribeVC = subscribeVC;
