const { Consumer } = require('../Lib/EventHandler/consumer/consumer');

// NodeJS에서 extends는 상속하는데 사용한다
class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv.dmap', partitions:0} ];
        super(kafkaHost, topics, options); // 부모 생성자 호출
        this.VC = VC;
    }
    run(){
        console.log('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', this.handler);

    }
    handler(message){
        // TODO
        const event = message.operation;
        const filepath = this._find_filepath(message.related);
        switch(event){
            case 'UPDATE':
                // file write
                this.VC.editFile(filepath, message.content);
                const commitNum = this.VC.commit(filepath, message);
                this.VC.reportCommit(filepath, assetID, commitNum);
                break;
            case 'DELETE':
                this.VC.deleteFile(filepath);
                break;

        }
    }
    _find_filepath(related) {
        // domain, taxonomy, category 순으로 재배치한 뒤 이를 바탕으로 폴더 정보를 뽑아낸다.
        var temp_dir = [];
        var numdomain = 0;
        var numtaxonomy = 0;

        for (var i = 0; i < related.length; i++) {
            if (related[i].type == "domain") {
                numdomain += 1;
                temp_dir.push({'order': 0, 'id': related[i].id});
            }
            else if (related[i].type == "taxonomy") {
                numtaxonomy += 1;
                temp_dir.push({'order': 1, 'id': related[i].id});
            }
            else if (related[i].type == "category") {
                temp_dir.push({'order': -1, 'id': related[i].id});
            }
            else {
                console.log("Wrong type");
            }
        }

        if (numdomain != 1 || numtaxonomy != 1) {
            console.log("Something Wrong in Data Structure");
        }

        temp_dir.sort(function(a,b) {
            if(a.order > b.order || (a.order < 0 && b.order >=0)) return 1;
            else if (a.order < b.order || (b.order < 0 && a.order >=0)) return -1;
            else return 0;
        })

        const dir_list = this.VC.vc.dir_list;
        var found = false;
        // reference rdf로부터 뽑아둔 파일 구조와 비교하면서 category간 관계를 파악한다.
        for (var i=0; i<dir_list.length; i++) {
            if (dir_list[i][0] == temp_dir[0].id && dir_list[i][1] == temp_dir[0].id) {
                for (var j = 2; j < temp_dir.length; j ++) {
                    var tmp = dir_list[i].indexOf(temp_dir[j].id);
                    if (tmp == -1) break;
                    temp_dir.order = tmp;
                }
                if (j == temp_dir.length) {
                    found = true;
                    break;
                }                                
            }
        }

        if (found == false) {
            console.log("directory not found from reference model");
        }

        temp_dir.sort(function(a,b) {
            if(a.order > b.order) return 1;
            else if (a.order < b.order) return -1;
            else return 0;
        })

        var filepath = this.VC.git_dir;
        for (var i = 0; i < temp_dir.length; i++) {
            filepath = filepath + '/' + temp_dir[i];
        }

        return filepath;
}

exports.vcConsumer = vcConsumer;
