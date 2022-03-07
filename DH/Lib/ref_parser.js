const { forEach } = require('async');
const fs = require('fs');
const debug = require('debug')('sodas:lib:ref-parser');

class ref_parser {
    // reference model을 읽어 폴더 구조로 변환하는 코드
    // 목표 1. Reference 파일을 읽어 Domain, Taxonomy, Category 별로 내용 추출
    // 목표 2. message.related <-> filepath 변환 기능 제공
    // 목표 3. Reference Model이 바뀔 때 업데이트 기능 제공

    // message.related 양식: [{operation': '', 'id': '', 'type': ''}, {...}]
    constructor(root, refRootdir) {
        this.root = root; // gitDB의 root 디렉토리
        this.refRootdir = refRootdir;
        this.referenceModel = []; // reference Model의 파일 경로
        // referenceModel로부터 뽑아낸 관계 정보가 담긴 linked list의 배열
        this.dom_related_list = [];
        this.tax_related_list = [];
        this.cat_related_list = [];
    }

    // ---------------------  외부 노출 함수 ----------------------- //
    // Reference Model 추가하는 함수
    addReferenceModel(ReferenceModel) {
        // List가 입력되면 Concat
        var self = this;
        if (typeof ReferenceModel === 'object') {
            // console.log("list");
            ReferenceModel.forEach((element) => {
                debug(this.refRootdir + '/' + element);
                self._createReferenceDir(this.refRootdir + '/' + element);
            });
        }
        // String이 입력되면 추가
        else if (typeof ReferenceModel === 'string') {
            // console.log(this.refRootdir + '/' + ReferenceModel);
            this._createReferenceDir(this.refRootdir + '/' + ReferenceModel);
        }
        else {
            // console.log("Error on Input Type");
        }
    }

    // related 정보가 들어오면 이를 바탕으로 filepath를 만들어주는 함수
    related_to_filepath(related) {
        // domain부터 시작해서 next를 타고 내려가면서 related 내에 해당하는 것들이 있는지 확인을 한다.
        // - related 내의 domain 정보 확인
        var related_domain = related.find((element) => {
            if (element.type === "domain") return true;
        });
        if (typeof related_domain === 'undefined') return false;
        // - domain_linked_list 에서 해당하는 linked_list 색출
        var current_LL = this.dom_related_list.find((element) => {
            if (element.id === related_domain.id) return true;
        });
        if (typeof current_LL === 'undefined') return false;
        // - next를 타고 내려가면서 related와 일치하는 지 확인한 후 마지막 linked list를 가져온다.
        for (var i = 1; i < related.length; i++) {
            // current LL의 next 검사
            current_LL = current_LL.next.find((LL) => {
                return related.some((element) => {
                    return (element.id === LL.id);
                });
            });
            // 검색되지 않는 경우 함수를 종료한다.
            if (typeof current_LL === 'undefined') return false;
        }
        // 정상적으로 끝냈다면 현재 current LL은 가장 마지막의 category를 가르켜야한다.
        var filePathArray = this._mkdirarray(current_LL);
        // Array로부터 string 형태의 filepath를 추출해내고 반환한다.
        var filePath = "";
        filePathArray.forEach((element) => {
            filePath = filePath + '/' + element;
        });
        return filePath.slice(1);
    }

    // ---------------------  내부 동작용 함수 ----------------------- //
    // 추가된 ReferenceModel이 기존 Domain의 업데이트인지 여부 확인
    _check_update(Ref) {
        // 새로 들어온 Ref의 /domain/ 뒷 부분을 확인하여 Domain 정보를 얻는다.

        // 기존 Domain 중 중복되는 Domain이 있는지 확인 후 해당 DomainVersion을 구한다.

        // 기존 내용 중 DomainVersion이 일치하는 내용을 삭제한다.

    }

    // Reference Model을 파싱하여 폴더 트리를 생성하는 함수
    _createReferenceDir(Ref) {
        this.referenceModel.push(Ref);
        // Reference Model을 읽어드린 후 Pre-Process ==> <rdf:Description> 구역 단위로 파티션들을 만든다.
        var content = fs.readFileSync(Ref).toString();
        var partition = this._partition(content.split('\n'));

        var temp_dom = [];
        var temp_tax = [];
        var temp_cat = [];

        // 각 파티션들을 Domain, Taxonomy, Category로 분류한 다음 각각 linked_list를 만든다.
        partition.forEach((element) => {
            if (element[0].indexOf('/domain-version') >= 0) temp_dom.push(this._domainparser(element));
            else if (element[0].indexOf('/taxonomy/') >= 0) temp_tax.push(this._taxonomyparser(element));
            else if (element[0].indexOf('/category/') >= 0) temp_cat.push(this._categoryparser(element));
        });

        // 현재 linked_list의 next와 prev에는 string 혹은 dictionary가 들어있는데, 이를 바로잡아 준다.
        if (this._linked_list_correction_all(temp_dom, temp_tax, temp_cat)) return false;
        else {
            // 뽑아낸 Linked List들로 디렉토리를 생성한다.
            this.dom_related_list.push(...temp_dom);
            this.tax_related_list.push(...temp_tax);
            this.cat_related_list.push(...temp_cat);
            this._mkdir_from_list();
            return true;
        }
    }

    // 해당 경로에 폴더를 생성하는 함수
    _folder_create(target) {
        !fs.existsSync(target) && fs.mkdirSync(target);
    }

    // 필요한 내용이 들은 줄이 파티션 내에서 몇 번째 인덱스에 해당하는지 반환하는 함수.
    // 검색할 파티션, 검색할 스트링
    // 인덱스 배열 반환
    _findLine(partition, toFind) {
        var line = [];
        partition.forEach((element, index) => {
            if (element.indexOf(toFind) >= 0) {
                line.push(index);
            }
        });
        return line;
    }

    // reference model rdf 파일을 구역별로 쪼개는 함수
    // 줄단위로 읽어드린 rdf 파일의 스트링을 입력값으로 넣어준다.
    _partition(contentArray) {
        let partition = [];
        let toStore = false; // 0이면 true, 1이면 false
        let temp = [];
        contentArray.forEach((element) => {
            if (!toStore) {
                // rdf:Description을 발견하면 temp에 저장하기 시작
                if (element.indexOf('<rdf:Description') >= 0) {
                    toStore = true;
                    temp.push(element);
                }
            } else {
                temp.push(element);
                // </rdf:Description>을 발견하면 저장을 멈추고 temp를 partition에 추가한 다음 비운다.
                if (element.indexOf('</rdf:Description>') >= 0) {
                    toStore = false;
                    partition.push(temp);
                    temp = [];
                }
            }
        });
        return partition;
    }

    // 파티션들에서 파싱한 정보를 갖고 linked_list를 만든다.
    // 아래 함수들에선 임시로 prev와 next를 문자열로 저장. 추후에 pop을 통하여 정비할 예정
    _domainparser(i_partition) {
        // <dct:isVersionOf ~/> 내에 domain 폴더 정보가 있다.
        var line_isVersion = this._findLine(i_partition, '<dct:isVersionOf');
        // id, dv를 구한다.
        var dv = i_partition[0].split('/domain-version/')[1].split('"')[0];
        var id = i_partition[line_isVersion[0]].split('/domain/')[1].split('"')[0];
        // Linked List 생성
        var LL = new linked_list(id, "domain", dv);
        // <sodas:taxonomy ~/> 내에 domain에 속하는 taxonomy 정보가 있다.
        var line_isTax = this._findLine(i_partition, '<sodas:taxonomy');
        line_isTax.forEach((element) => {
            LL.next.push(i_partition[element].split('/taxonomy/')[1].split('"')[0])
        });
        return LL;
    }
    _taxonomyparser(i_partition) {
        // id, dv를 구한다.
        var id = i_partition[0].split('/taxonomy/')[1].split('"')[0];
        // <skos:inScheme ~/> 내에 상위 폴더 정보가 있다.
        var line_inScheme = this._findLine(i_partition, '<skos:inScheme');
        var dv = i_partition[line_inScheme[0]].split('/domain-version/')[1].split('"')[0];
        // Linked List 생성
        var LL = new linked_list(id, "taxonomy", dv);
        LL._setPrev(dv);
        // <skos:hasTopConcept ~/> 내에 하위 폴더 정보가 있다.
        var line_hasTop = this._findLine(i_partition, '<skos:hasTopConcept');
        line_hasTop.forEach((element) => {
            LL.next.push(i_partition[element].split('/category/')[1].split('"')[0]);
        });
        return LL;
    }
    _categoryparser(i_partition) {
        // id를 구한다.
        var id = i_partition[0].split('/category/')[1].split('"')[0];
        var LL = new linked_list(id, "category");
        // category는 broader을 갖는 경우 상위가 category이다.
        var line_nar = this._findLine(i_partition, '<skos:narrower');
        var line_bro = this._findLine(i_partition, '<skos:broader');
        if (line_bro.length === 0) {
            // topConceptOf가 상위
            var line_top = this._findLine(i_partition, '<skos:topConceptOf');
            LL._setPrev({type: "tax", id: i_partition[line_top[0]].split('/taxonomy/')[1].split('"')[0]});
        }
        else {
            // broader가 상위
            LL._setPrev({type: "cat", id: i_partition[line_bro[0]].split('/category/')[1].split('"')[0]});
        }
        // narrower가 하위
        line_nar.forEach((element) => {
            LL.next.push(i_partition[element].split('/category/')[1].split('"')[0]);
        });
        return LL;
    }

    // 위에서 만든 linked list에서 prev와 next를 전부 다른 linked_list로 바꿔준다.
    _linked_list_correction_all(temp_dom, temp_tax, temp_cat) {
        var fault = false;
        fault = fault || temp_dom.some((element) => {
            if(!this._linked_list_correction(element,temp_dom, temp_tax, temp_cat)) {
                debug("[ERROR]");
                return true;
            }
        });
        if (fault) return false;
        fault = fault || temp_tax.some((element) => {
            if(!this._linked_list_correction(element,temp_dom, temp_tax, temp_cat)) {
                debug("[ERROR]");
                return true;
            }
        });
        if (fault) return false;
        fault = fault || temp_cat.some((element) => {
            if(!this._linked_list_correction(element,temp_dom, temp_tax, temp_cat)) {
                debug("[ERROR]");
                return true;
            }
        });
        if (fault) return false;
    }
    _linked_list_correction(LL,temp_dom,temp_tax,temp_cat) {
        // domain에 해당하는 경우 next와 taxonomy를 이어준다.
        if (LL.type == "domain") {
            // next correction
            for (var i = 0; i < LL.next.length; i++) {
                // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
                var tax_id = LL.next.pop();
                // - tax_id에 해당하는 linked_list를 찾는다.
                const tax_ll = temp_tax.find((element) => {
                    if (element.id === tax_id) return true;
                });
                LL.next.unshift(tax_ll);
            }
        }
        // taxonomy에 해당하는 경우 prev를 domain과, next를 category와 이어준다.
        else if (LL.type == "taxonomy") {
            // next correction
            for (var i = 0; i < LL.next.length; i++) {
                // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
                var cat_id = LL.next.pop();
                // - cat_id에 해당하는 linked_list를 찾는다.
                var cat_ll = temp_cat.find((element) => {
                    if (element.id === cat_id) return true;
                });
                cat_ll.dv = LL.dv
                LL.next.unshift(cat_ll);
            }
            // prev correction
            LL.prev = temp_dom.find((element) => {
                if (element.dv === LL.prev) return true;
            });
        }
        // category인 경우
        else {
            // next correction
            for (var i = 0; i < LL.next.length; i++) {
                // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
                var cat_id = LL.next.pop();
                // - cat_id에 해당하는 linked_list를 찾는다.
                var cat_ll = temp_cat.find((element) => {
                    if (element.id === cat_id) return true;
                });
                if (LL.dv !== null) cat_ll.dv = LL.dv;
                LL.next.unshift(cat_ll);
            }
            // prev correction
            if (LL.prev.type === 'cat') {
                LL.prev = temp_cat.find((element) => {
                    if (element.id === LL.prev.id) return true;
                });
                if (LL.prev.dv !== null) LL.dv = LL.prev.dv;
            }
            else {
                LL.prev = temp_tax.find((element) => {
                    if (element.id === LL.prev.id) return true;
                });
                LL.dv = LL.prev.dv;
            }
        }
        // 문제 여부 확인 - 상위 분류가 먼저 전부 correction이 끝났다고 가정한다.
        var noFault = true;
        if (LL.next.some((element) => { return (typeof(element) === 'string'); })) noFault = false;
        if (LL.prev != null) noFault = noFault && LL._checkRelation();
        return noFault;
    }

    // linked list들로부터 파일 트리 정보가 담긴 array를 만든다.
    _mkdirarray(LL) {
        var temp_dir_list = [LL.id];
        // prev가 null일 때까지 검색해 들어가면서 temp_dir_list에 [상위, .. , 하위] 순서로 id를 쌓는다.
        if (LL.prev) temp_dir_list = this._mkdirarray(LL.prev).concat(temp_dir_list);
        return temp_dir_list;
    }

    // dir_list를 갖고 root 폴더 아래에 폴더들을 만든다.
    _mkdir_from_list() {
        var dir_list = [];
        // next가 없는 category만 갖고 우선 디렉토리를 뽑아낸다.
        this.cat_related_list.forEach((element) => {
            if (element.next.length == 0) {
                dir_list.push(this._mkdirarray(element));
            }
        });
        // next가 없는 taxonomy만 갖고 우선 디렉토리를 뽑아낸다.
        this.tax_related_list.forEach((element) => {
            if (element.next.length == 0) {
                dir_list.push(this._mkdirarray(element));
            }
        });
        // next가 없는 domain만 갖고 우선 디렉토리를 뽑아낸다.
        this.dom_related_list.forEach((element) => {
            if (element.next.length == 0) {
                dir_list.push(this._mkdirarray(element));
            }
        });

        dir_list.forEach((dirarray) => {
            var folder_dir = this.root
            dirarray.forEach((element) => {
                folder_dir = folder_dir + '/' + element;
                this._folder_create(folder_dir);
            });
        });
    }
}

// Linked list의 원본 클래스
class linked_list {
    // prev는 반드시 하나의 class 객체야 한다.
    constructor(id, type, dv=null) {
        this.id = id; // Domain/Taxonomy/Category 의 id
        this.type = type;
        this.dv = dv; // Domain과 Taxonomy에서만 사용된다. root에 해당하는 Domain의 Version을 뜻한다.
        this.prev = null;
        this.next = [];
    }

    // prev 세팅
    _setPrev(prev) {
        this.prev = prev;
    }

    // next 추가
    _addNext(next) {
        this.next.push(next);
    }

    // 상위 클래스와의 비교를 통해 오류 점검 - 문제 발생 시 false 반환
    _checkRelation() {
        if (typeof(this.prev) === 'string') return false;
        if (this.prev.next.indexOf(this) < 0) return false;
        else return true;
    }
}

exports.ref_parser = ref_parser;
