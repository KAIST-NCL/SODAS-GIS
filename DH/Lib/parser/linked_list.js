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

exports.linked_list = linked_list;