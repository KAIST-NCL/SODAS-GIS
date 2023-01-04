.. _RMSyncModule:

RMSync
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | JiHwan Kim (j.h_kim@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)
:Version: 3.0.0 of 2022.11.30

RMSync 모듈은 SODAS+ GIS :ref:`gsDaemon` 에 의해 실행되는 모듈로, SODAS+ 생태계 내 DIS 에서 오픈 참조 모델 동기화를 위한 세션 연동 요청에 따른 세션 연동을 수행하는 :ref:`rmSessionManager` 모듈과
:ref:`rmSessionManager` 모듈에 의해 생성된 :ref:`rmSession` 모듈을 통한 오픈 참조 모델 동기화를 수행한다.


|

.. toctree::
   :maxdepth: 2
   :caption: SubModules:

   _RMSessionManager
   _RMSession

===============================================

.. toctree::
   :maxdepth: 2
   :caption: Protobuf:

   _RMSessionProto
   _RMSessionSyncProto
