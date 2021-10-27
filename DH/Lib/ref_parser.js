const fs = require('fs');

class ref_parser {
    constructor(root) {
        this.dom_dir = [];
        this.tax_dir = [];
        this.cat_dir = [];
        this.dir_list = [];
        this.root = root;
    }

    // 필요한 내용이 들은 줄이 파티션 내에서 몇 번째 인덱스에 해당하는지 반환하는 함수.
    // 검색할 파티션, 검색할 스트링
    // 인덱스 배열 반환
    _findLine(partition, toFind) {
        var line = [];
        for (var i = 0; i < partition.length; i++) {
            if (partition[i].indexOf(toFind) != -1) {
                line.push(i);
            }
        }
        return line;
    }

    // 해당하는 경로에 폴더를 생성하는 함수
    folder_create(target) {
        !fs.existsSync(target) && fs.mkdirSync(target);
    }

    // reference model rdf 파일을 구역별로 쪼개는 함수
    // 줄단위로 읽어드린 rdf 파일의 스트링을 입력값으로 넣어준다.
    _partition(contentArray) {
        let partition = [];
        let toStore = false; // 0이면 true, 1이면 false
        let temp = [];
        for (var i = 0; i < contentArray.length; i++) {
            if (!toStore) {
                // rdf:Description을 발견하면 temp에 저장하기 시작
                if (contentArray[i].indexOf('<rdf:Description') != -1) {
                    toStore = true;
                    temp.push(contentArray[i]);
                }
            }
            else {
                temp.push(contentArray[i]);
                // </rdf:Description>을 발견하면 저장을 멈추고 temp를 partition에 추가한 다음 비운다.
                if (contentArray[i].indexOf('</rdf:Description>') != -1) {
                    toStore = false;
                    partition.push(temp)
                    temp = []
                }
            }
        }
        return partition;
    }

    // 파티션 중 domain에 해당하는 파티션의 내용을 분석하여 [{dv: , name: , tax: []}, ]의 양식으로 저장
    _domainparser(i_partition) {
        var temp_dom = {'dv': '', name: '', tax: []};
        temp_dom.dv = i_partition[0].split('/domain-version/')[1].split('"')[0];
        // <dct:isVersionOf ~/> 내에 domain 폴더 정보가 있다.
        var line_isVersion = this._findLine(i_partition, '<dct:isVersionOf');
        temp_dom.name = i_partition[line_isVersion[0]].split('/domain/')[1].split('"')[0];
        // <sodas:taxonomy ~/> 내에 domain에 속하는 taxonomy 정보가 있다.
        var line_isTax = this._findLine(i_partition, '<sodas:taxonomy');
        for (var j=0; j < line_isTax.length; j++) {
            temp_dom.tax.push(i_partition[line_isTax[j]].split('/taxonomy/')[1].split('"')[0]);
        }
        this.dom_dir.push(temp_dom);
    }

    // 파티션 중 taxonomy에 해당하는 파티션의 내용을 분석하여 [{dv: , name: , cat: []}, ]의 양식으로 저장
    _taxonomyparser(i_partition) {
        var temp_tax = {'dv':'', 'name': '', 'cat': []};
        temp_tax.name = i_partition[0].split('/taxonomy/')[1].split('"')[0];
        // <skos:inScheme ~/> 내에 상위 폴더 정보가 있다.
        var line_inScheme = this._findLine(i_partition, '<skos:inScheme');
        temp_tax.dv = i_partition[line_inScheme[0]].split('/domain-version/')[1].split('"')[0];
        // <skos:hasTopConcept ~/> 내에 하위 폴더 정보가 있다.
        var line_hasTop = this._findLine(i_partition, '<skos:hasTopConcept');
        for (var j = 0; j <line_hasTop.length; j++) {
            temp_tax.cat.push(i_partition[line_hasTop[j]].split('/category/')[1].split('"')[0]);
        }
        this.tax_dir.push(temp_tax);
    }

    // 파티션 중 category에 해당하는 파티션의 내용을 분석하여 [{upper: , name: , below: []}, ]의 양식으로 저장
    _categoryparser(i_partition) {
        var temp_cat = {'upper':'', 'name': '', 'below': []};
        temp_cat.name = i_partition[0].split('/category/')[1].split('"')[0];
        // category는 broader을 갖는는 경우 category이다.
        var line_nar = this._findLine(i_partition, '<skos:narrower');
        var line_bro = this._findLine(i_partition, '<skos:broader');
        if (line_bro.length === 0) {
            // topConceptOf가 상위
            var line_top = this._findLine(i_partition, '<skos:topConceptOf');
            temp_cat.upper = i_partition[line_top[0]].split('/taxonomy/')[1].split('"')[0];
        }
        else {
            // broader가 상위
            temp_cat.upper = i_partition[line_bro[0]].split('/category/')[1].split('"')[0];               
        }
        // narrower가 하위
        for (var j = 0; j < line_nar.length; j++) {
            temp_cat.below.push(i_partition[line_nar[j]].split('/category/')[1].split('"')[0])
        }
        this.cat_dir.push(temp_cat);
    }

    // 무결성 체크 함수들
    check_cat_tax(cat) {
        const target_tax = this.tax_dir.filter(function (element) {
            if (element.name == cat.upper) {
                return true;
            }
        })
        if (target_tax.length != 1 || target_tax[0].cat.indexOf(cat.name) == -1) {
            console.log("Error")
        }
    }

    check_cat_cat(cat) {
        const target_cat = this.cat_dir.filter(function (element) {
            if (element.name == cat.upper) {
                return true;
            }
        })
        if (target_cat.length != 1 || target_cat[0].below.indexOf(cat.name) == -1) {
            console.log("Error")
        }
    }

    check_tax_dom(tax) {
        const target_dom = this.dom_dir.filter(function (element) {
            if (element.dv == tax.dv) {
                return true;
            }
        })
        if (target_dom.length != 1 || target_dom[0].tax.indexOf(tax.name) == -1) {
            console.log("Error")
        }
    }

    // category 정보로부터 역순으로 거슬러 올라가며 폴더 구조를 배열 형식으로 만들어낸다.
    mkdir_from_category(cat) {
        var temp_dir_list = [];
        // 상위 category가 있으면 다 찾아낸다.
        var current = cat;
        temp_dir_list.unshift(current.name);
        while (true) {
            // upper에 taxonomy가 있으면 category 검색 루프는 끝낸다.
            if (current.upper.indexOf('taxonomy') !== -1) {
                break;
            }
            // 상위 category 검색
            else {
                current = this.cat_dir.find(function (element) {
                    if (element.name == current.upper) {
                        return true;
                    }
                })
                temp_dir_list.unshift(current.name);
            }
        }
        // 상위 taxonomy를 찾아낸다.
        current = this.tax_dir.find(function (element) {
            if (element.name == current.upper) {
                return true;
            }
        })
        // 상위 domain을 찾아낸다.
        temp_dir_list.unshift(...this.mkdir_from_taxonomy(current));
        return temp_dir_list
    }

    // taxonomy 정보로부터 역순으로 거슬러 올라가며 폴더 구조를 배열 형식으로 만들어낸다.
    mkdir_from_taxonomy(tax) {
        var temp_dir_list = [];
        var current = tax;
        temp_dir_list.unshift(current.name);
        // 상위 domain을 찾아낸다.
        current = this.dom_dir.find(function (element) {
            if (element.dv == current.dv) {
                return true;
            }
        })
        temp_dir_list.unshift(current.name);
        return temp_dir_list
    }

    // 배열 형식 폴더 구조를 갖고 실제 폴더를 생성한다.
    array_to_filetree(dir_array) {
        var folder_dir = this.root
        for (var i = 0; i < dir_array.length; i++) {
            folder_dir = folder_dir + '/' + dir_array[i];
            this.folder_create(folder_dir);
        }
    }
}

exports.ref_parser = ref_parser;