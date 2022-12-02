DHSearch
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | JiHwan Kim (j.h_kim@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)
:Version: 3.0.0 of 2022.11.30

DHSearch 모듈은 SODAS+ DIS :ref:`dhDaemon` 에 의해 실행되는 모듈로, 거버넌스 시스템(GS)의 Bootstrap 서버로부터 최근 SODAS+ 플랫폼에 접속한 SeedNode의 접속 정보를 조회한 뒤, SeedNode 정보를 통해 관심도 기반 데이터 허브 분산 탐색하는 역할을 수행한다.

DHSearch 모듈은 :ref:`dhDaemon` 와의 연동을 통한 Control Event 메시지를 처리하는 :ref:`dhSearch` 와 거버넌스 시스템(GS)의 Bootstrap 서버로부터 gRPC 기반 SeedNode 정보를 조회하기 위한 gRPC 프로토버퍼 :ref:`bootstrapProto`,
그리고 관심도 기반 데이터 허브 분산 탐색 프로토콜이 구현된 :ref:`kademlia` 로 구성된다.


|

.. toctree::
   :maxdepth: 2
   :caption: SubModules:

   _DHSearch
   _kademlia

===============================================

.. toctree::
   :maxdepth: 2
   :caption: Protobuf:

   _BootstrapProto
