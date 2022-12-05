.. _SessionManagerModule:

SessionManager
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | Ji-Hwan Kim (j.h_kim@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)
:Version: 3.0.0 of 2022.11.30

SessionManager 모듈은 SODAS+ DIS :ref:`dhDaemon` 에 의해 실행되는 모듈로, :ref:`dhSearch` 에서 탐색한 관심 동기화 수준의 데이터맵을 소유한 다른 데이터 허브와의 데이터맵 동기화를 위한 세션 연동 기능을 수행하며, VersionControl 모듈과 연동하여 다른 데이터 허브와의 세션을 통한 데이터맵 전송 기능을 수행한다.

SessionManager 모듈은 다른 데이터 허브의 :ref:`sessionListener` 로 데이터맵 동기화 세션 연동을 위한 세션 협상 요청을 보내는 :ref:`sessionRequester` 와 다른 데이터 허브의 세션 협상 요청을 처리하는 :ref:`sessionListener` 로 구성된다.

데이터 허브 간 세션 협상 성공이 될 경우 :ref:`session` 이 구동되며, 세션 협상 과정에서 합의한 동기화 수준에 해당하는 데이터맵이 변경될 경우 상대 데이터 허브의 :ref:`session` 으로 변경된 부분만 증분 추출하여 동기화 전송한다.


|

.. toctree::
   :maxdepth: 2
   :caption: SubModules:

   _SessionManager
   _SessionRequester
   _SessionListener
   _Session

===============================================

.. toctree::
   :maxdepth: 2
   :caption: Protobuf:

   _SessionNegotiationProto
   _SessionSyncProto
