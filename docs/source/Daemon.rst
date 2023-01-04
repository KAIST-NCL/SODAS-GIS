.. _DaemonModule:

Daemon
======================================

Daemon 모듈은 SODAS+ GIS 시스템으로 들어오는 이벤트 입력을 처리하고 GIS 시스템의 모듈을 가동하고 이벤트를 전달하는 역할을 수행한다.
Daemon 모듈은 거버넌스 시스템으로부터 들어오는 Kafka 메시지를 관리하고 타 모듈들과 연동을 수행하는 :ref:`gsDaemon` 과 Kafka 와의 통신을 위한 :ref:`ctrlKafka` 모듈로 구성된다.


|

.. toctree::
   :maxdepth: 1
   :caption: SubModules:

   _GSDaemon
   _ctrlKafka
