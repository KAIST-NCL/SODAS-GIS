// RDF 및 JSON parser
const rdf_parser = require('./parser/rdf_parser');
const json_parser = require('./parser/json_parser');
const { linked_list } = require('./parser/linked_list');
const path = require('path');
const { forEach } = require('async');
const fs = require('fs');
const debug = require('debug')('sodas:lib:ref-parser');

class ref_parser {
    // message.related 양식: [{operation': '', 'id': '', 'type': ''}, {...}]
    constructor(root, refRootdir) {
        this.root = root; // gitDB의 root 디렉토리
        this.refRootdir = refRootdir + '/gitDB';

        this.referenceModel = []; // reference Model의 파일 경로
        // referenceModel로부터 뽑아낸 관계 정보가 담긴 linked list의 배열
        this.dom_related_list = [];
        this.tax_related_list = [];
        this.cat_related_list = [];
    }

    // addReferenceModel -> 파일 읽고 json/RDF 판별 후 알맞은 라이브러리 호출
    addReferenceModel(ReferenceModel) {
        // List가 입력되면 Concat
        var self = this;
        if (typeof ReferenceModel === 'object') {
            // console.log("list");
            ReferenceModel.forEach((element) => {
                debug(this.refRootdir + '/' + element);
                if(path.extname(element) == '.json') json_parser._createReferenceDir(this.refRootdir + '/' + element, self);
                else if (path.extname(element) == '.rdf') rdf_parser._createReferenceDir(this.refRootdir + '/' + element, self);
            });
        }
        // String이 입력되면 추가
        else if (typeof ReferenceModel === 'string') {
            // console.log(this.refRootdir + '/' + ReferenceModel);
            if(path.extname(ReferenceModel) == '.json') json_parser._createReferenceDir(this.refRootdir + '/' + ReferenceModel, self);
            else if (path.extname(ReferenceModel) == '.rdf') rdf_parser._createReferenceDir(this.refRootdir + '/' + ReferenceModel, self);
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

    // 해당 경로에 폴더를 생성하는 함수
    _folder_create(target) {
        !fs.existsSync(target) && fs.mkdirSync(target, {recursive: true});
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