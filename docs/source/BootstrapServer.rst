.. _BootstrapServerModule:

BootstrapServer
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | JiHwan Kim (j.h_kim@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)
:Version: 3.0.0 of 2022.11.30

BootstrapServer 모듈은 SODAS+ GIS :ref:`gsDaemon` 에 의해 실행되는 모듈로,
DIS DHSearch 로부터의 SeedNode 리스트 조회 및 SeedNode 정보 삭제 요청을 처리하기 위해 :ref:`bootstrapProto` protobuf 규격을 따르는,
gRPC 서버 구동 및 해당 기능을 처리하는 :ref:`bootstrapServer` 모듈로 구성된다.


|

.. toctree::
   :maxdepth: 2
   :caption: SubModules:

   _BootstrapServer

===============================================

.. toctree::
   :maxdepth: 2
   :caption: Protobuf:

   _BootstrapProto
