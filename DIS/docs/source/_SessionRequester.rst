.. _sessionRequester:

SessionRequester
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | JiHwan Kim (j.h_kim@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)
:Version: 3.0.0 of 2022.11.30

SessionRequester 모듈은 :ref:`sessionManager` 모듈에 의해 실행되는 모듈로, :ref:`sessionManager` 으로부터 Control Event(`SYNC_ON`) 메시지를 처리한다.

주요 기능으로는 `SYNC_ON` 메세지와 함께 전달받은 세션 협상을 요청할 다른 데이터 허브 정보(`Bucket`)를 조회하며, 다른 데이터 허브의 :ref:`sessionListener` 로 세션 협상을 gRPC 통신(:ref:`sessionNegotiationProto`)을 통해 요청한다.

===============================================

.. js:autoclass:: SessionRequester
   :members:
   :private-members:
