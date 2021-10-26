const { Git } = require(__dirname + '/../Lib/git');


class VC {

    // static class variable (mutex)
    static Flag = false;
    constructor(gitDir, referenceModel) {
        this.vcRoot = gitDir;
        this.git = new Git(this.vcRoot);
        if(typeof(referenceModel) != null){
            this.setReferenceModel(referenceModel);
        }
        this.isInit = false;
    }

    async init(){
        await this.git.init();
        this.isInit = true;
    }

    setReferenceModel(referenceModel){
        this.RM = referenceModel;
        this._createReferenceDir();
    }

    async commit(filepath, message){
        if(this.constructor.name.Flag){
            // retry commit
            const timeOut = 100;
            setTimeout(this.commit.bind(this), timeOut, filepath, message);
        }else{
            // MUTEX ON
            this.constructor.name.Flag = true;
            const commitNum = await this.git.commit(filepath, message);
            // MUTEX OFF
            this.constructor.name.Flag = false;
            return commitNum;
        }
    }

    _createReferenceDir(){
        // TODO: this.RM을 파싱하고 디렉토리 구조를 생성
    }
}

class publishVC extends VC{
    constructor(gitDir, referenceModel) {
        super(gitDir, referenceModel);
    }
}

class subscribeVC extends VC{
    constructor(gitDir, referenceModel) {
        super(gitDir, referenceModel);
    }
    async commit(filepath, message){
        await this.git.commit(filepath, message);
    }
}


exports.VC = VC;
exports.publishVC = publishVC;
exports.subscribeVC = subscribeVC;