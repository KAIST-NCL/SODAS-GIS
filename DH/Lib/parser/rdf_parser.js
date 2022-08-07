const { forEach } = require('async');
const fs = require('fs');
const debug = require('debug')('sodas:lib:ref-parser');

exports.rdf_parser = function(ref) {
    this.ref = ref;
}

    // 추가된 ReferenceModel이 기존 Domain의 업데이트인지 여부 확인
exports.rdf_parser.prototype._check_update = function(Ref) {
    // 새로 들어온 Ref의 /domain/ 뒷 부분을 확인하여 Domain 정보를 얻는다.

    // 기존 Domain 중 중복되는 Domain이 있는지 확인 후 해당 DomainVersion을 구한다.

    // 기존 내용 중 DomainVersion이 일치하는 내용을 삭제한다.

}

    // Reference Model을 파싱하여 폴더 트리를 생성하는 함수
exports.rdf_parser.prototype._createReferenceDir = function(Ref) {
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
        this.ref.dom_related_list.push(...temp_dom);
        this.ref.tax_related_list.push(...temp_tax);
        this.ref.cat_related_list.push(...temp_cat);
        this.ref._mkdir_from_list();
        return true;
    }
}

    // 필요한 내용이 들은 줄이 파티션 내에서 몇 번째 인덱스에 해당하는지 반환하는 함수.
    // 검색할 파티션, 검색할 스트링
    // 인덱스 배열 반환
exports.rdf_parser.prototype._findLine = function(partition, toFind) {
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
exports.rdf_parser.prototype._partition = function(contentArray) {
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
exports.rdf_parser.prototype._domainparser = function(i_partition) {
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
exports.rdf_parser.prototype._taxonomyparser = function(i_partition) {
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
exports.rdf_parser.prototype._categoryparser = function(i_partition) {
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
exports.rdf_parser.prototype._linked_list_correction_all = function(temp_dom, temp_tax, temp_cat) {
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
exports.rdf_parser.prototype._linked_list_correction = function(LL,temp_dom,temp_tax,temp_cat) {
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

